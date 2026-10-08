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
const notification_service_1 = require("./notification.service");
const auto_migrate_1 = require("../lib/auto-migrate");
class OtpService {
    static hashOtp(otp, identifier) {
        const salt = config_1.config.jwt.secret;
        return crypto_1.default
            .createHmac('sha256', salt)
            .update(`${identifier}:${otp}`)
            .digest('hex');
    }
    static generateOtpCode() {
        // Generate secure 6-digit code between 100000 and 999999
        return crypto_1.default.randomInt(100000, 999999).toString();
    }
    // ============================================================================
    // 1. MOBILE PHONE OTP DISPATCH & VERIFICATION
    // ============================================================================
    static async requestOtp(phone, purpose = 'login', options) {
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
        // Invalidate previous unused OTPs for this phone
        await prisma_1.prisma.otpVerification.updateMany({
            where: { phone: canonical, isUsed: false },
            data: { isUsed: true },
        });
        // If already dispatched by MSG91 widget on client, record session for cooldown and avoid duplicate SMS
        if (options?.widgetDispatched) {
            await prisma_1.prisma.otpVerification.create({
                data: {
                    phone: canonical,
                    identifier: canonical,
                    otpHash: 'MSG91_WIDGET_DISPATCHED',
                    purpose,
                    expiresAt: new Date(Date.now() + config_1.config.otp.expirySeconds * 1000),
                    maxAttempts: config_1.config.otp.maxAttempts,
                },
            });
            console.log(`[OTP] Widget dispatch session registered for ${canonical}`);
            return {
                success: true,
                message: 'OTP dispatched via MSG91 widget.',
                cooldownSeconds: config_1.config.otp.resendCooldownSeconds,
            };
        }
        const otpCode = this.generateOtpCode();
        const otpHash = this.hashOtp(otpCode, canonical);
        const expiresAt = new Date(Date.now() + config_1.config.otp.expirySeconds * 1000);
        // Create new OTP record
        await prisma_1.prisma.otpVerification.create({
            data: {
                phone: canonical,
                identifier: canonical,
                otpHash,
                purpose,
                expiresAt,
                maxAttempts: config_1.config.otp.maxAttempts,
            },
        });
        const isNonProd = process.env.NODE_ENV !== 'production';
        console.log(`🔑 [OTP] Mobile: ${canonical} | Generated OTP: ${otpCode} | Purpose: ${purpose}`);
        // Send OTP via MSG91 server-side API (no secrets exposed to client)
        const msg91Res = await msg91_service_1.Msg91Service.sendOtp(canonical, otpCode);
        if (!msg91Res.success) {
            console.warn(`[OTP] MSG91 SMS dispatch notice: ${msg91Res.message}`);
            // In development / sandbox mode, do not throw so testing can proceed smoothly
            if (!isNonProd) {
                throw new Error(msg91Res.message || "We couldn't deliver the SMS right now. Please try via Email OTP or try again.");
            }
        }
        return {
            success: true,
            message: 'OTP dispatched successfully to your mobile number.',
            cooldownSeconds: config_1.config.otp.resendCooldownSeconds,
            ...(isNonProd ? { devOtp: otpCode } : {}),
        };
    }
    static async resendOtp(phone, purpose = 'resend', options) {
        return this.requestOtp(phone, purpose, options);
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
        if (!isValidHash && (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') && otpCode === '123456') {
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
    // ============================================================================
    // 2. EMAIL OTP DISPATCH & VERIFICATION (NEW!)
    // ============================================================================
    static async requestEmailOtp(email, purpose = 'verification', userName) {
        await (0, auto_migrate_1.ensureDatabaseSchema)().catch(() => { });
        const canonicalEmail = (email || '').trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!canonicalEmail || !emailRegex.test(canonicalEmail)) {
            throw new Error('Please enter a valid email address.');
        }
        // Check rate limit (max 5 requests per 15 minutes per email)
        const fifteenMinutesAgo = new Date(Date.now() - config_1.config.otp.rateLimitWindowMinutes * 60 * 1000);
        const recentRequestsCount = await prisma_1.prisma.otpVerification.count({
            where: {
                email: canonicalEmail,
                createdAt: { gte: fifteenMinutesAgo },
            },
        });
        if (recentRequestsCount >= config_1.config.otp.rateLimitMaxRequests) {
            throw new Error('Too many OTP requests for this email. Please wait a few minutes before trying again.');
        }
        // Check resend cooldown (30 seconds)
        const latestOtp = await prisma_1.prisma.otpVerification.findFirst({
            where: { email: canonicalEmail },
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
        // Invalidate previous unused OTPs for this email
        await prisma_1.prisma.otpVerification.updateMany({
            where: { email: canonicalEmail, isUsed: false },
            data: { isUsed: true },
        });
        const otpCode = this.generateOtpCode();
        const otpHash = this.hashOtp(otpCode, canonicalEmail);
        const expiresAt = new Date(Date.now() + config_1.config.otp.expirySeconds * 1000);
        // Save OTP record
        await prisma_1.prisma.otpVerification.create({
            data: {
                email: canonicalEmail,
                identifier: canonicalEmail,
                otpHash,
                purpose,
                expiresAt,
                maxAttempts: config_1.config.otp.maxAttempts,
            },
        });
        const isNonProd = process.env.NODE_ENV !== 'production';
        console.log(`✉️ [OTP] Email: ${canonicalEmail} | Generated OTP: ${otpCode} | Purpose: ${purpose}`);
        // Generate executive HTML email template
        const html = notification_service_1.NotificationService.generateEmailTemplate({
            title: 'Your Vaziro Email Verification Code',
            userName: userName || 'Member',
            badge: 'EMAIL SECURITY VERIFICATION',
            message: 'Please use the 6-digit verification code below to confirm your email address and secure your Vaziro account:',
            highlightCode: otpCode,
            subNote: '🔒 Security Notice: This code is valid for 15 minutes. Never share this code or your password with anyone. Vaziro staff will never ask for your OTP.',
        });
        // Send email via Resend
        const resendRes = await notification_service_1.NotificationService.sendEmailViaResend({
            to: canonicalEmail,
            subject: `${otpCode} is your Vaziro email verification code`,
            html,
        });
        if (!resendRes.success) {
            console.warn(`[OTP] Email dispatch warning: ${resendRes.error}`);
            if (!isNonProd) {
                throw new Error('Failed to dispatch email. Please check your email address and try again.');
            }
        }
        return {
            success: true,
            message: `Verification code sent to ${canonicalEmail}. Please check your inbox.`,
            cooldownSeconds: config_1.config.otp.resendCooldownSeconds,
            ...(isNonProd ? { devOtp: otpCode } : {}),
        };
    }
    static async verifyEmailOtp(email, otpCode, purpose = 'verification') {
        await (0, auto_migrate_1.ensureDatabaseSchema)().catch(() => { });
        const canonicalEmail = (email || '').trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!canonicalEmail || !emailRegex.test(canonicalEmail)) {
            throw new Error('Please enter a valid email address.');
        }
        const record = await prisma_1.prisma.otpVerification.findFirst({
            where: {
                email: canonicalEmail,
                isUsed: false,
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (!record) {
            throw new Error('This verification code has expired. Please request a new code.');
        }
        if (record.attempts >= record.maxAttempts) {
            await prisma_1.prisma.otpVerification.update({
                where: { id: record.id },
                data: { isUsed: true },
            });
            throw new Error('Too many incorrect attempts. Please request a new code.');
        }
        // Verify hash
        const inputHash = this.hashOtp(otpCode, canonicalEmail);
        let isValidHash = inputHash === record.otpHash;
        // Development / test-only bypass (strictly disabled in production)
        if (!isValidHash && (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') && otpCode === '123456') {
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
                throw new Error('Too many incorrect attempts. Please request a new code.');
            }
            throw new Error('The verification code is incorrect. Please check and try again.');
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
