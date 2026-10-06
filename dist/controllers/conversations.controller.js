"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationsController = void 0;
const chat_service_1 = require("../services/chat.service");
const message_service_1 = require("../services/message.service");
const call_request_service_1 = require("../services/call-request.service");
const attachment_service_1 = require("../services/attachment.service");
const report_service_1 = require("../services/report.service");
const block_service_1 = require("../services/block.service");
class ConversationsController {
    /**
     * GET /api/v1/conversations
     */
    static async getConversations(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { status, search, limit, offset } = req.query;
            const conversations = await chat_service_1.ChatService.getConversations(userId, {
                status: status,
                search: search,
                limit: limit ? Number(limit) : undefined,
                offset: offset ? Number(offset) : undefined,
            });
            return res.status(200).json({
                success: true,
                data: conversations,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch conversations' },
            });
        }
    }
    /**
     * POST /api/v1/conversations
     */
    static async createConversation(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { jobId, requirementId, otherUserId } = req.body;
            if (!otherUserId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'otherUserId is required to start a conversation' },
                });
            }
            const conversation = await chat_service_1.ChatService.getOrCreateConversation(userId, {
                jobId,
                requirementId,
                otherUserId,
            });
            return res.status(201).json({
                success: true,
                data: conversation,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to create conversation' },
            });
        }
    }
    /**
     * GET /api/v1/conversations/:id
     */
    static async getConversation(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const isAdmin = !!req.user?.roles.includes('ADMIN');
            const conversation = await chat_service_1.ChatService.getConversationById(id, userId, isAdmin);
            return res.status(200).json({
                success: true,
                data: conversation,
            });
        }
        catch (error) {
            const status = error.message?.includes('Unauthorized') ? 403 : 404;
            return res.status(status).json({
                success: false,
                error: { message: error.message || 'Failed to fetch conversation' },
            });
        }
    }
    /**
     * GET /api/v1/conversations/:id/messages
     */
    static async getMessages(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const { limit, beforeId } = req.query;
            const isAdmin = !!req.user?.roles.includes('ADMIN');
            const messages = await message_service_1.MessageService.getMessages(id, userId, {
                limit: limit ? Number(limit) : undefined,
                beforeId: beforeId,
            }, isAdmin);
            return res.status(200).json({
                success: true,
                data: messages,
            });
        }
        catch (error) {
            const status = error.message?.includes('Unauthorized') ? 403 : 500;
            return res.status(status).json({
                success: false,
                error: { message: error.message || 'Failed to fetch messages' },
            });
        }
    }
    /**
     * POST /api/v1/conversations/:id/messages
     */
    static async sendMessage(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const { content, body, messageType, attachmentUrl, fileName, fileType, fileSize } = req.body;
            const messageContent = content || body || '';
            const message = await message_service_1.MessageService.sendMessage(userId, id, {
                content: messageContent,
                messageType,
                attachmentUrl,
                fileName,
                fileType,
                fileSize,
            });
            return res.status(201).json({
                success: true,
                data: message,
            });
        }
        catch (error) {
            const status = error.message?.includes('Unauthorized')
                ? 403
                : error.message?.includes('blocked')
                    ? 400
                    : 500;
            return res.status(status).json({
                success: false,
                error: { message: error.message || 'Failed to send message' },
            });
        }
    }
    /**
     * POST /api/v1/conversations/:id/read
     */
    static async markAsRead(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            await message_service_1.MessageService.getMessages(id, userId, { limit: 1 });
            return res.status(200).json({
                success: true,
                message: 'Conversation marked as read',
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to mark as read' },
            });
        }
    }
    /**
     * POST /api/v1/conversations/:id/archive
     */
    static async archiveConversation(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const { isArchived = true } = req.body;
            await chat_service_1.ChatService.setArchiveStatus(id, userId, isArchived);
            return res.status(200).json({
                success: true,
                message: isArchived ? 'Conversation archived' : 'Conversation unarchived',
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update archive status' },
            });
        }
    }
    /**
     * POST /api/v1/conversations/:id/attachments
     */
    static async uploadAttachment(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { fileName, base64Data } = req.body;
            if (!fileName || !base64Data) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'fileName and base64Data are required' },
                });
            }
            const result = await attachment_service_1.AttachmentService.saveBase64Attachment(fileName, base64Data);
            return res.status(201).json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to upload attachment' },
            });
        }
    }
    /**
     * POST /api/v1/conversations/:id/call-requests
     */
    static async createCallRequest(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const { requestedDate, requestedStartTime, requestedEndTime, message } = req.body;
            if (!requestedDate || !requestedStartTime) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'requestedDate and requestedStartTime are required' },
                });
            }
            const callRequest = await call_request_service_1.CallRequestService.createCallRequest(userId, {
                conversationId: id,
                requestedDate,
                requestedStartTime,
                requestedEndTime,
                message,
            });
            return res.status(201).json({
                success: true,
                message: 'Call request sent successfully',
                data: callRequest,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to create call request' },
            });
        }
    }
    /**
     * GET /api/v1/conversations/:id/call-requests
     */
    static async getCallRequests(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const requests = await call_request_service_1.CallRequestService.getCallRequestsForConversation(id, userId);
            return res.status(200).json({
                success: true,
                data: requests,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch call requests' },
            });
        }
    }
    /**
     * POST /api/v1/call-requests/:id/accept
     */
    static async acceptCallRequest(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const result = await call_request_service_1.CallRequestService.acceptCallRequest(userId, id);
            return res.status(200).json({
                success: true,
                message: 'Call request accepted. Call session is ready.',
                data: result,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to accept call request' },
            });
        }
    }
    /**
     * POST /api/v1/call-requests/:id/decline
     */
    static async declineCallRequest(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const { reason } = req.body;
            const result = await call_request_service_1.CallRequestService.declineCallRequest(userId, id, reason);
            return res.status(200).json({
                success: true,
                message: 'Call request declined',
                data: result,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to decline call request' },
            });
        }
    }
    /**
     * POST /api/v1/call-requests/:id/cancel
     */
    static async cancelCallRequest(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const result = await call_request_service_1.CallRequestService.cancelCallRequest(userId, id);
            return res.status(200).json({
                success: true,
                message: 'Call request cancelled',
                data: result,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to cancel call request' },
            });
        }
    }
    /**
     * POST /api/v1/conversations/:id/report
     */
    static async reportConversation(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const { reportedUserId, messageId, reason, description } = req.body;
            if (!reportedUserId || !reason) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'reportedUserId and reason are required' },
                });
            }
            const report = await report_service_1.ReportService.fileReport(userId, {
                conversationId: id,
                reportedUserId,
                messageId,
                reason,
                description,
            });
            return res.status(201).json({
                success: true,
                message: 'Report submitted. Our safety team will review this case.',
                data: report,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to submit report' },
            });
        }
    }
    /**
     * POST /api/v1/conversations/:id/block
     */
    static async blockUser(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { id } = req.params;
            const { blockedUserId, reason } = req.body;
            if (!blockedUserId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'blockedUserId is required' },
                });
            }
            const block = await block_service_1.BlockService.blockUser(userId, {
                conversationId: id,
                blockedUserId,
                reason,
            });
            return res.status(200).json({
                success: true,
                message: 'User has been blocked. They can no longer send messages or call requests.',
                data: block,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to block user' },
            });
        }
    }
    /**
     * POST /api/v1/conversations/:id/unblock
     */
    static async unblockUser(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { blockedUserId } = req.body;
            if (!blockedUserId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'blockedUserId is required' },
                });
            }
            await block_service_1.BlockService.unblockUser(userId, blockedUserId);
            return res.status(200).json({
                success: true,
                message: 'User has been unblocked.',
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to unblock user' },
            });
        }
    }
}
exports.ConversationsController = ConversationsController;
