import { Router } from 'express';
import { BoostController } from '../controllers/boost.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Publicly visible boost packages
router.get('/packages', BoostController.getPackages);

// Customer requirement boost purchase & verification
router.post('/create-order', authenticate, BoostController.createOrder);
router.post('/verify-payment', authenticate, BoostController.verifyPayment);

// Requirement boost status
router.get('/requirement/:requirementId', BoostController.getRequirementBoost);

export default router;
