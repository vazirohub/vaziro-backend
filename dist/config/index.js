"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    jwt: {
        secret: process.env.JWT_SECRET || 'vaziro_default_development_jwt_secret_2026',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'vaziro_default_development_refresh_secret_2026',
        expiresIn: process.env.JWT_EXPIRES_IN || '1d',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    otp: {
        expirySeconds: 300, // 5 minutes
        maxAttempts: 3,
        resendCooldownSeconds: 60,
        rateLimitMaxRequests: 5,
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
        sms: process.env.SMS_PROVIDER || 'MOCK',
        payment: process.env.PAYMENT_PROVIDER || 'MOCK',
        calling: process.env.CALL_PROVIDER || 'MOCK',
        verification: process.env.VERIFICATION_PROVIDER || 'DIGILOCKER_MOCK',
        ai: process.env.AI_PROVIDER || 'MOCK',
        map: process.env.MAP_PROVIDER || 'MOCK',
    },
};
