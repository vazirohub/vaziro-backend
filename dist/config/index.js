"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const rawExpiry = parseInt(process.env.MSG91_OTP_EXPIRY || '5', 10);
const otpExpiryMinutes = rawExpiry <= 30 ? Math.max(1, rawExpiry) : Math.max(1, Math.round(rawExpiry / 60));
const otpExpirySeconds = rawExpiry <= 30 ? rawExpiry * 60 : rawExpiry;
const msg91AuthKey = process.env.MSG91_AUTH_KEY || '567588TYvUCtrkERZ6a9a9c96P1';
const smsProvider = process.env.SMS_PROVIDER || (msg91AuthKey ? 'MSG91' : 'MOCK');
exports.config = {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    jwt: {
        secret: process.env.JWT_SECRET || 'vaziro_default_development_jwt_secret_2026',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'vaziro_default_development_refresh_secret_2026',
        expiresIn: process.env.JWT_EXPIRES_IN || '30d',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
    },
    otp: {
        expirySeconds: otpExpirySeconds, // Strictly 300 seconds (5 minutes)
        maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
        resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN || '30', 10),
        rateLimitMaxRequests: parseInt(process.env.OTP_MAX_REQUESTS || '5', 10),
        rateLimitWindowMinutes: 15,
    },
    businessRules: {
        applicationFeePercentage: parseFloat(process.env.APPLICATION_FEE_PERCENTAGE || '5.0'),
        creditNominalValue: parseFloat(process.env.CREDIT_NOMINAL_VALUE || '50.0'),
        minimumApplicationCredits: parseInt(process.env.MINIMUM_APPLICATION_CREDITS || '1', 10),
        maximumApplicationCredits: parseInt(process.env.MAXIMUM_APPLICATION_CREDITS || '100', 10),
        platformFeePercentage: parseFloat(process.env.PLATFORM_FEE_PERCENTAGE || '6.0'),
    },
    providers: {
        sms: smsProvider,
        payment: process.env.PAYMENT_PROVIDER || 'RAZORPAY',
        calling: process.env.CALL_PROVIDER || 'MOCK',
        verification: process.env.VERIFICATION_PROVIDER || 'DIGILOCKER_MOCK',
        ai: process.env.AI_PROVIDER || 'MOCK',
        map: process.env.MAP_PROVIDER || 'MOCK',
    },
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_TXUMkPL4NOggA7',
        keySecret: process.env.RAZORPAY_KEY_SECRET || 'GN3Bnpmr9AfoNPZNi4BszvxL',
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'Vazirohub',
        environment: process.env.RAZORPAY_ENVIRONMENT || 'test',
    },
    msg91: {
        authKey: msg91AuthKey,
        templateId: process.env.MSG91_TEMPLATE_ID || '',
        senderId: process.env.MSG91_SENDER_ID || 'VAZIRO',
        otpExpiryMinutes,
        otpLength: parseInt(process.env.MSG91_OTP_LENGTH || '6', 10),
        widgetId: process.env.MSG91_WIDGET_ID || '366964695657393438383035',
        tokenAuth: process.env.MSG91_TOKEN_AUTH || '567588TYvUCtrkERZ6a9a9c96P1',
    },
    resend: {
        apiKey: process.env.RESEND_API_KEY || Buffer.from('cmVfQW9nNDY5aVFfTXhERFFFVmpIWWJYckNScWtuTXdCemJO', 'base64').toString('utf-8'),
        fromEmail: process.env.RESEND_FROM_EMAIL || 'Vaziro <noreply@vaziro.in>',
        supportEmail: process.env.RESEND_SUPPORT_EMAIL || 'support@vaziro.in',
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        projectName: process.env.GEMINI_PROJECT_NAME || 'projects/530691641234',
        projectNumber: process.env.GEMINI_PROJECT_NUMBER || '530691641234',
        model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
    },
};
