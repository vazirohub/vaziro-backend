"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
const msg91_service_1 = require("./msg91.service");
const auto_migrate_1 = require("../lib/auto-migrate");
class OtpService {
    static hashOtp(otp, phone) {
        const salt = config_1.config.jwt.secret;
        return crypto_1.default
            .createHmac('sha256', salt)
            .update(`${phone}:${otp}`)
            .digest('hex');
    }
    static generateOtpCode() {
        // Generate secure 6-digit code between 100000 and 999999
        return crypto_1.default.randomInt(100000, 999999).toString();
    }
    static async requestOtp(phone, purpose = 'login') {
        await (0, auto_migrate_1.ensureDatabaseSchema)().catch(() => { });
        const { canonical, isValid } = msg91_service_1.Msg91Service.normalizeIndianMobile(phone);
        if (!isValid) {
            throw new Error('Please enter a valid 10-digit Indian mobile number.');
        }
        // Check velocity rate limit (max 5 requests per 15 minutes)
        const fifteenMinutesAgo = new Date(Date.now() - config_1.config.otp.rateLimitWindowMinutes * 60 * 1000);
        const recentRequestsCount = await prisma_1.prisma.otpVerification.count({
            where: {
                phone: canonical,
                createdAt: { gte: fifteenMinutesAgo },
            },
        });
        if (recentRequestsCount >= config_1.config.otp.rateLimitMaxRequests) {
            throw new Error('Too many OTP requests. Please wait a few minutes before trying again.');
        }
        // Check resend cooldown
        const latestOtp = await prisma_1.prisma.otpVerification.findFirst({
            where: { phone: canonical },
            orderBy: { createdAt: 'desc' },
        });
        if (latestOtp) {
            const elapsedSeconds = (Date.now() - latestOtp.createdAt.getTime()) / 1000;
            if (elapsedSeconds < config_1.config.otp.resendCooldownSeconds) {
                const remaining = Math.ceil(config_1.config.otp.resendCooldownSeconds - elapsedSeconds);
                return {
                    success: false,
                    message: `Please wait ${remaining} seconds before requesting a new OTP.`,
                    cooldownSeconds: remaining,
                };
            }
        }
        const otpCode = this.generateOtpCode();
        const otpHash = this.hashOtp(otpCode, canonical);
        const expiresAt = new Date(Date.now() + config_1.config.otp.expirySeconds * 1000);
        // Invalidate previous unused OTPs for this phone
        await prisma_1.prisma.otpVerification.updateMany({
            where: { phone: canonical, isUsed: false },
            data: { isUsed: true },
        });
        // Create new OTP record
        await prisma_1.prisma.otpVerification.create({
            data: {
                phone: canonical,
                otpHash,
                purpose,
                expiresAt,
                maxAttempts: config_1.config.otp.maxAttempts,
            },
        });
        // Send OTP via MSG91 server-side API (no secrets exposed to client)
        const msg91Res = await msg91_service_1.Msg91Service.sendOtp(canonical, otpCode);
        if (!msg91Res.success) {
            throw new Error(msg91Res.message || "We couldn't send the OTP right now. Please try again in a moment.");
        }
        return {
            success: true,
            message: 'OTP dispatched successfully.',
            cooldownSeconds: config_1.config.otp.resendCooldownSeconds,
        };
    }
    static async resendOtp(phone, purpose = 'resend') {
        return this.requestOtp(phone, purpose);
    }
    static async verifyOtp(phone, otpCode, purpose = 'login') {
        await (0, auto_migrate_1.ensureDatabaseSchema)().catch(() => { });
        const { canonical, isValid } = msg91_service_1.Msg91Service.normalizeIndianMobile(phone);
        if (!isValid) {
            throw new Error('Please enter a valid 10-digit Indian mobile number.');
        }
        const record = await prisma_1.prisma.otpVerification.findFirst({
            where: {
                phone: canonical,
                isUsed: false,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (!record) {
            throw new Error('This OTP has expired. Please request a new OTP.');
        }
        if (record.attempts >= record.maxAttempts) {
            await prisma_1.prisma.otpVerification.update({
                where: { id: record.id },
                data: { isUsed: true },
            });
            throw new Error('Too many incorrect attempts. Please request a new OTP.');
        }
        // Verify hash
        const inputHash = this.hashOtp(otpCode, canonical);
        let isValidHash = inputHash === record.otpHash;
        // Development / test-only bypass (strictly disabled in production)
        if (!isValidHash && process.env.NODE_ENV === 'test' && otpCode === '123456') {
            isValidHash = true;
        }
        if (!isValidHash) {
            const newAttempts = record.attempts + 1;
            await prisma_1.prisma.otpVerification.update({
                where: { id: record.id },
                data: {
                    attempts: newAttempts,
                    ...(newAttempts >= record.maxAttempts ? { isUsed: true } : {}),
                },
            });
            if (newAttempts >= record.maxAttempts) {
                throw new Error('Too many incorrect attempts. Please request a new OTP.');
            }
            throw new Error('The OTP is incorrect. Please check and try again.');
        }
        // Mark as successfully verified & used
        await prisma_1.prisma.otpVerification.update({
            where: { id: record.id },
            data: {
                isUsed: true,
                verifiedAt: new Date(),
            },
        });
        return true;
    }
    static async cleanupExpiredOtps() {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            await prisma_1.prisma.otpVerification.deleteMany({
                where: {
                    createdAt: { lt: oneDayAgo },
                },
            });
        }
        catch {
            // Non-blocking cleanup
        }
    }
}
exports.OtpService = OtpService;
