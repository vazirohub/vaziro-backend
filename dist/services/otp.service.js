"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
const sms_service_1 = require("./sms.service");
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
    static async requestOtp(phone) {
        // Check velocity rate limit (max 5 requests per 15 minutes)
        const fifteenMinutesAgo = new Date(Date.now() - config_1.config.otp.rateLimitWindowMinutes * 60 * 1000);
        const recentRequestsCount = await prisma_1.prisma.otpVerification.count({
            where: {
                phone,
                createdAt: { gte: fifteenMinutesAgo },
            },
        });
        if (recentRequestsCount >= config_1.config.otp.rateLimitMaxRequests) {
            throw new Error('Too many OTP requests. Please wait 15 minutes before trying again.');
        }
        // Check resend cooldown
        const latestOtp = await prisma_1.prisma.otpVerification.findFirst({
            where: { phone },
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
        const otpHash = this.hashOtp(otpCode, phone);
        const expiresAt = new Date(Date.now() + config_1.config.otp.expirySeconds * 1000);
        // Invalidate previous unused OTPs for this phone
        await prisma_1.prisma.otpVerification.updateMany({
            where: { phone, isUsed: false },
            data: { isUsed: true },
        });
        // Create new OTP record
        await prisma_1.prisma.otpVerification.create({
            data: {
                phone,
                otpHash,
                expiresAt,
                maxAttempts: config_1.config.otp.maxAttempts,
            },
        });
        // Send SMS via provider abstraction
        const smsContent = `Your Vaziro verification code is ${otpCode}. Valid for 5 minutes. Please do not share this OTP.`;
        await sms_service_1.smsProvider.sendSMS(phone, smsContent);
        return {
            success: true,
            message: 'OTP dispatched successfully.',
            cooldownSeconds: config_1.config.otp.resendCooldownSeconds,
        };
    }
    static async verifyOtp(phone, otpCode) {
        const record = await prisma_1.prisma.otpVerification.findFirst({
            where: {
                phone,
                isUsed: false,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (!record) {
            throw new Error('OTP has expired or is invalid. Please request a new one.');
        }
        if (record.attempts >= record.maxAttempts) {
            await prisma_1.prisma.otpVerification.update({
                where: { id: record.id },
                data: { isUsed: true },
            });
            throw new Error('Maximum OTP attempts exceeded. Please request a new OTP.');
        }
        // In mock SMS mode, accept 123456 as a master test OTP
        const isMock = config_1.config.providers.sms === 'MOCK';
        let isValid = false;
        if (isMock && otpCode === '123456') {
            isValid = true;
        }
        else {
            const expectedHash = this.hashOtp(otpCode, phone);
            isValid = crypto_1.default.timingSafeEqual(Buffer.from(record.otpHash, 'utf8'), Buffer.from(expectedHash, 'utf8'));
        }
        if (!isValid) {
            await prisma_1.prisma.otpVerification.update({
                where: { id: record.id },
                data: { attempts: record.attempts + 1 },
            });
            const remaining = record.maxAttempts - (record.attempts + 1);
            throw new Error(`Incorrect OTP. ${remaining} attempt(s) remaining.`);
        }
        // Mark OTP as used
        await prisma_1.prisma.otpVerification.update({
            where: { id: record.id },
            data: { isUsed: true },
        });
        return true;
    }
}
exports.OtpService = OtpService;
