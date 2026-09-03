import { Router } from 'express';
import { DisputesController } from '../controllers/disputes.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', DisputesController.raiseDispute);
router.get('/:id', DisputesController.getDispute);
router.post('/:id/resolve', requireRoles('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), DisputesController.resolveDispute);

export default router;
