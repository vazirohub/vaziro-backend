"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const ai_controller_1 = require("../controllers/ai.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Section 13: Dedicated rate limiter for AI endpoints to control costs and prevent abuse
const aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 30, // 30 requests per minute
    message: {
        success: false,
        error: { message: 'Too many AI requests. Please slow down and try again shortly.' },
    },
    standardHeaders: true,
    legacyHeaders: false,
});
router.use(aiLimiter);
// 1. AI Support Chat (General + Account-Specific if token present)
router.post('/chat', auth_middleware_1.optionalAuthenticate, ai_controller_1.AIController.chat);
router.post('/support-chat', auth_middleware_1.optionalAuthenticate, ai_controller_1.AIController.chat);
// 2. Natural Language Requirement Extraction
router.post('/extract-requirement', auth_middleware_1.optionalAuthenticate, ai_controller_1.AIController.extractRequirement);
// 3. Smart Requirement Assistant ("Polish with AI")
router.post('/polish-requirement', auth_middleware_1.optionalAuthenticate, ai_controller_1.AIController.polishRequirement);
// 4. Candidate Match Rationale
router.post('/match-rationale', auth_middleware_1.optionalAuthenticate, ai_controller_1.AIController.getMatchRationale);
// 5. Section 6: Internal Gemini health diagnostic (Restricted to Admins only; never public in production)
router.get('/health', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), ai_controller_1.AIController.healthCheck);
exports.default = router;
