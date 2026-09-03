import { Router } from 'express';
import { CreditsController } from '../controllers/credits.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Public plan browsing & dynamic fee calculation
router.get('/plans', CreditsController.getPlans);
router.post('/calculate-fee', CreditsController.calculateFee);

// Professional credit wallet management
router.get('/wallet', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), CreditsController.getWallet);
router.post('/purchase', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), CreditsController.purchasePlan);
router.post('/create-order', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), CreditsController.createOrder);
router.post('/verify-payment', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), CreditsController.verifyPayment);

export default router;
