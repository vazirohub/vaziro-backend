import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', NotificationsController.listNotifications);
router.patch('/:id/read', NotificationsController.markAsRead);
router.patch('/read-all', NotificationsController.markAllAsRead);

export default router;
