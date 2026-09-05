import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AIController } from '../controllers/ai.controller';
import { authenticate, optionalAuthenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Section 13: Dedicated rate limiter for AI endpoints to control costs and prevent abuse
const aiLimiter = rateLimit({
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
router.post('/chat', optionalAuthenticate, AIController.chat);
router.post('/support-chat', optionalAuthenticate, AIController.chat);

// 2. Natural Language Requirement Extraction
router.post('/extract-requirement', optionalAuthenticate, AIController.extractRequirement);

// 3. Smart Requirement Assistant ("Polish with AI")
router.post('/polish-requirement', optionalAuthenticate, AIController.polishRequirement);

// 4. Candidate Match Rationale
router.post('/match-rationale', optionalAuthenticate, AIController.getMatchRationale);

// 5. Section 6: Internal Gemini health diagnostic (Restricted to Admins only; never public in production)
router.get('/health', authenticate, requireRoles('ADMIN', 'SUPER_ADMIN'), AIController.healthCheck);

export default router;
