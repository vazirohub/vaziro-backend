"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callRequestsRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const conversations_controller_1 = require("../controllers/conversations.controller");
const router = (0, express_1.Router)();
// Conversation endpoints
router.get('/', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.getConversations);
router.post('/', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.createConversation);
router.get('/:id', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.getConversation);
router.get('/:id/messages', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.getMessages);
router.post('/:id/messages', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.sendMessage);
router.post('/:id/read', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.markAsRead);
router.post('/:id/archive', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.archiveConversation);
router.post('/:id/attachments', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.uploadAttachment);
// Call request endpoints linked to conversation
router.post('/:id/call-requests', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.createCallRequest);
router.get('/:id/call-requests', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.getCallRequests);
// Moderation & Safety
router.post('/:id/report', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.reportConversation);
router.post('/:id/block', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.blockUser);
router.post('/:id/unblock', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.unblockUser);
exports.default = router;
// Export standalone call-requests router
exports.callRequestsRouter = (0, express_1.Router)();
exports.callRequestsRouter.post('/:id/accept', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.acceptCallRequest);
exports.callRequestsRouter.post('/:id/decline', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.declineCallRequest);
exports.callRequestsRouter.post('/:id/cancel', auth_middleware_1.authenticate, conversations_controller_1.ConversationsController.cancelCallRequest);
