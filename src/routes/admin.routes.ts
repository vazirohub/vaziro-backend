import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Restrict entire admin namespace to admin roles
router.use(authenticate, requireRoles('ADMIN', 'SUPER_ADMIN'));

router.get('/metrics', AdminController.getMetrics);
router.get('/users', AdminController.getUsers);
router.patch('/users/:id/status', AdminController.updateUserStatus);
router.get('/verifications', AdminController.getVerifications);
router.patch('/verifications/:id', AdminController.reviewVerification);
router.get('/settings', AdminController.getSettings);
router.put('/settings', AdminController.updateSetting);
router.patch('/locations/toggle', AdminController.toggleLocation);

export default router;
