import { Router } from 'express';
import { ProfessionalsController } from '../controllers/professionals.controller';
import { authenticate, optionalAuthenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Professional profile management
router.get('/me', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.getMyProfile);
router.put('/me', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.updateProfile);

// Professional Verification (DigiLocker / API Setu)
router.get('/verification/status', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.getVerificationStatus);
router.post('/verification/start', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.startVerification);
router.get('/verification/callback', optionalAuthenticate, ProfessionalsController.completeVerification);
router.post('/verification/callback', optionalAuthenticate, ProfessionalsController.completeVerification);
router.post('/verification/retry', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.retryVerification);
router.post('/verification/webhook', ProfessionalsController.handleWebhook);

// Backward-compatible aliases
router.get('/verify/apisetu/initiate', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.initiateApiSetuVerification);
router.post('/verify/apisetu/callback', ProfessionalsController.completeApiSetuVerification);
router.post('/verify/digilocker', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.verifyDigiLocker);

// Public profile view
router.get('/:id', ProfessionalsController.getPublicProfile);

export default router;
