import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { ConversationsController } from '../controllers/conversations.controller';

const router = Router();

// Conversation endpoints
router.get('/', authenticate, ConversationsController.getConversations);
router.post('/', authenticate, ConversationsController.createConversation);
router.get('/:id', authenticate, ConversationsController.getConversation);
router.get('/:id/messages', authenticate, ConversationsController.getMessages);
router.post('/:id/messages', authenticate, ConversationsController.sendMessage);
router.post('/:id/read', authenticate, ConversationsController.markAsRead);
router.post('/:id/archive', authenticate, ConversationsController.archiveConversation);
router.post('/:id/attachments', authenticate, ConversationsController.uploadAttachment);

// Call request endpoints linked to conversation
router.post('/:id/call-requests', authenticate, ConversationsController.createCallRequest);
router.get('/:id/call-requests', authenticate, ConversationsController.getCallRequests);

// Moderation & Safety
router.post('/:id/report', authenticate, ConversationsController.reportConversation);
router.post('/:id/block', authenticate, ConversationsController.blockUser);
router.post('/:id/unblock', authenticate, ConversationsController.unblockUser);

export default router;

// Export standalone call-requests router
export const callRequestsRouter = Router();
callRequestsRouter.post('/:id/accept', authenticate, ConversationsController.acceptCallRequest);
callRequestsRouter.post('/:id/decline', authenticate, ConversationsController.declineCallRequest);
callRequestsRouter.post('/:id/cancel', authenticate, ConversationsController.cancelCallRequest);
