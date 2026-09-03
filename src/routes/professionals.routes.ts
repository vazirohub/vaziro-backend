import { Router } from 'express';
import { ProfessionalsController } from '../controllers/professionals.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Professional profile management
router.get('/me', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.getMyProfile);
router.put('/me', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.updateProfile);
router.post('/verify/digilocker', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), ProfessionalsController.verifyDigiLocker);

// Public profile view
router.get('/:id', ProfessionalsController.getPublicProfile);

export default router;
