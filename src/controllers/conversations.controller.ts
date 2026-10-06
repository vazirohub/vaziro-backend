import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';
import { MessageService } from '../services/message.service';
import { CallRequestService } from '../services/call-request.service';
import { AttachmentService } from '../services/attachment.service';
import { ReportService } from '../services/report.service';
import { BlockService } from '../services/block.service';

export class ConversationsController {
  /**
   * GET /api/v1/conversations
   */
  public static async getConversations(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { status, search, limit, offset } = req.query;

      const conversations = await ChatService.getConversations(userId, {
        status: status as string,
        search: search as string,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });

      return res.status(200).json({
        success: true,
        data: conversations,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch conversations' },
      });
    }
  }

  /**
   * POST /api/v1/conversations
   */
  public static async createConversation(req: Request, res: Response) {
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

      const conversation = await ChatService.getOrCreateConversation(userId, {
        jobId,
        requirementId,
        otherUserId,
      });

      return res.status(201).json({
        success: true,
        data: conversation,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create conversation' },
      });
    }
  }

  /**
   * GET /api/v1/conversations/:id
   */
  public static async getConversation(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      const isAdmin = !!req.user?.roles.includes('ADMIN');

      const conversation = await ChatService.getConversationById(id, userId, isAdmin);

      return res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (error: any) {
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
  public static async getMessages(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      const { limit, beforeId } = req.query;
      const isAdmin = !!req.user?.roles.includes('ADMIN');

      const messages = await MessageService.getMessages(
        id,
        userId,
        {
          limit: limit ? Number(limit) : undefined,
          beforeId: beforeId as string,
        },
        isAdmin
      );

      return res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error: any) {
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
  public static async sendMessage(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      const { content, body, messageType, attachmentUrl, fileName, fileType, fileSize } = req.body;

      const messageContent = content || body || '';

      const message = await MessageService.sendMessage(userId, id, {
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
    } catch (error: any) {
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
  public static async markAsRead(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      await MessageService.getMessages(id, userId, { limit: 1 });

      return res.status(200).json({
        success: true,
        message: 'Conversation marked as read',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to mark as read' },
      });
    }
  }

  /**
   * POST /api/v1/conversations/:id/archive
   */
  public static async archiveConversation(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      const { isArchived = true } = req.body;

      await ChatService.setArchiveStatus(id, userId, isArchived);

      return res.status(200).json({
        success: true,
        message: isArchived ? 'Conversation archived' : 'Conversation unarchived',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update archive status' },
      });
    }
  }

  /**
   * POST /api/v1/conversations/:id/attachments
   */
  public static async uploadAttachment(req: Request, res: Response) {
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

      const result = await AttachmentService.saveBase64Attachment(fileName, base64Data);

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to upload attachment' },
      });
    }
  }

  /**
   * POST /api/v1/conversations/:id/call-requests
   */
  public static async createCallRequest(req: Request, res: Response) {
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

      const callRequest = await CallRequestService.createCallRequest(userId, {
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
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to create call request' },
      });
    }
  }

  /**
   * GET /api/v1/conversations/:id/call-requests
   */
  public static async getCallRequests(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      const requests = await CallRequestService.getCallRequestsForConversation(id, userId);

      return res.status(200).json({
        success: true,
        data: requests,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch call requests' },
      });
    }
  }

  /**
   * POST /api/v1/call-requests/:id/accept
   */
  public static async acceptCallRequest(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      const result = await CallRequestService.acceptCallRequest(userId, id);

      return res.status(200).json({
        success: true,
        message: 'Call request accepted. Call session is ready.',
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to accept call request' },
      });
    }
  }

  /**
   * POST /api/v1/call-requests/:id/decline
   */
  public static async declineCallRequest(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      const { reason } = req.body;

      const result = await CallRequestService.declineCallRequest(userId, id, reason);

      return res.status(200).json({
        success: true,
        message: 'Call request declined',
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to decline call request' },
      });
    }
  }

  /**
   * POST /api/v1/call-requests/:id/cancel
   */
  public static async cancelCallRequest(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const { id } = req.params;
      const result = await CallRequestService.cancelCallRequest(userId, id);

      return res.status(200).json({
        success: true,
        message: 'Call request cancelled',
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to cancel call request' },
      });
    }
  }

  /**
   * POST /api/v1/conversations/:id/report
   */
  public static async reportConversation(req: Request, res: Response) {
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

      const report = await ReportService.fileReport(userId, {
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
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to submit report' },
      });
    }
  }

  /**
   * POST /api/v1/conversations/:id/block
   */
  public static async blockUser(req: Request, res: Response) {
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

      const block = await BlockService.blockUser(userId, {
        conversationId: id,
        blockedUserId,
        reason,
      });

      return res.status(200).json({
        success: true,
        message: 'User has been blocked. They can no longer send messages or call requests.',
        data: block,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to block user' },
      });
    }
  }

  /**
   * POST /api/v1/conversations/:id/unblock
   */
  public static async unblockUser(req: Request, res: Response) {
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

      await BlockService.unblockUser(userId, blockedUserId);

      return res.status(200).json({
        success: true,
        message: 'User has been unblocked.',
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to unblock user' },
      });
    }
  }
}
