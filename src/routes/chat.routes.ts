import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/threads', ChatController.getThreads);
router.get('/threads/:id/messages', ChatController.getMessages);
router.post('/threads/:id/messages', ChatController.sendMessage);

export default router;
