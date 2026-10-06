import { prisma } from '../lib/prisma';
import { ContactProtectionService } from './contact-protection.service';
import { SocketService } from './socket.service';
import { NotificationService } from './notification.service';
import { BlockService } from './block.service';

export interface SendMessageOptions {
  content: string;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  attachmentUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

export interface GetMessagesOptions {
  limit?: number;
  beforeId?: string;
}

export class MessageService {
  /**
   * Retrieves messages for a conversation with pagination
   * and automatically updates read timestamps for the current user.
   */
  public static async getMessages(
    conversationId: string,
    userId: string,
    options: GetMessagesOptions = {},
    isAdmin = false
  ) {
    const { limit = 50, beforeId } = options;

    const thread = await prisma.chatThread.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });

    if (!thread) {
      throw new Error('Conversation not found');
    }

    const isParticipant = thread.participants.some((p) => p.userId === userId);
    if (!isParticipant && !isAdmin) {
      throw new Error('Unauthorized to access this conversation');
    }

    const where: any = {
      chatThreadId: conversationId,
      deletedAt: null,
    };

    if (beforeId) {
      const cursorMessage = await prisma.message.findUnique({ where: { id: beforeId } });
      if (cursorMessage) {
        where.createdAt = { lt: cursorMessage.createdAt };
      }
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true },
        },
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Mark messages as read for this participant
    await prisma.chatParticipant.updateMany({
      where: { chatThreadId: conversationId, userId },
      data: { lastReadAt: new Date() },
    });

    // Mark other participant's messages as READ in DB
    await prisma.message.updateMany({
      where: {
        chatThreadId: conversationId,
        senderUserId: { not: userId },
        status: { in: ['SENT', 'DELIVERED'] },
      },
      data: { status: 'READ' },
    });

    // Emit read receipt event via Socket.IO
    SocketService.emitToConversation(conversationId, 'message:read', {
      conversationId,
      readByUserId: userId,
      readAt: new Date(),
    });

    // Return messages in chronological ascending order
    return messages.reverse().map((m) => ({
      ...m,
      body: m.content,
      isMe: m.senderUserId === userId,
    }));
  }

  /**
   * Sends a message in a conversation with Contact Protection,
   * database persistence, and real-time Socket.IO dispatch.
   */
  public static async sendMessage(
    senderUserId: string,
    conversationId: string,
    options: SendMessageOptions
  ) {
    const { content, messageType = 'TEXT', attachmentUrl, fileName, fileType, fileSize } = options;

    if ((!content || !content.trim()) && !attachmentUrl) {
      throw new Error('Message content or attachment is required');
    }

    const thread = await prisma.chatThread.findUnique({
      where: { id: conversationId },
      include: {
        job: true,
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!thread) {
      throw new Error('Conversation not found');
    }

    const isParticipant = thread.participants.some((p) => p.userId === senderUserId);
    if (!isParticipant) {
      throw new Error('Unauthorized: You are not a participant in this conversation');
    }

    // Check block status between participants
    const otherParticipant = thread.participants.find((p) => p.userId !== senderUserId);
    if (otherParticipant) {
      const isBlocked = await BlockService.isBlocked(senderUserId, otherParticipant.userId);
      if (isBlocked) {
        throw new Error('Cannot send messages: One or both participants have blocked communication');
      }
    }

    // Determine if job is hired (allows contact sharing if policy allows)
    const isHired = !!(
      thread.job &&
      [
        'HIRED',
        'SCHEDULED',
        'PREPARING',
        'ON_THE_WAY',
        'ARRIVED',
        'SERVICE_STARTED',
        'SERVICE_COMPLETED',
        'CUSTOMER_APPROVED',
      ].includes(thread.job.status)
    );

    // Apply Contact Protection Inspection
    const rawContent = (content || '').trim();
    const inspection = ContactProtectionService.inspect(rawContent, isHired);

    const message = await prisma.message.create({
      data: {
        chatThreadId: conversationId,
        senderUserId,
        content: inspection.sanitizedContent || 'Sent an attachment',
        messageType: attachmentUrl ? (fileType?.includes('IMAGE') || ['JPG', 'PNG', 'WEBP'].includes(fileType || '') ? 'IMAGE' : 'FILE') : messageType,
        status: 'SENT',
        isContactWarning: inspection.hasContactInfo,
        attachments: attachmentUrl
          ? {
              create: {
                fileUrl: attachmentUrl,
                fileName: fileName || 'attachment',
                fileType: fileType || null,
                fileSize: fileSize || null,
              },
            }
          : undefined,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true },
        },
        attachments: true,
      },
    });

    // Update ChatThread timestamps and unarchive
    await prisma.chatThread.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        lastMessageAt: new Date(),
      },
    });

    // Emit real-time message to conversation room and user rooms
    const payload = {
      ...message,
      body: message.content,
      conversationId,
      warningMessage: inspection.warningMessage,
    };

    SocketService.emitToConversation(conversationId, 'message:new', payload);

    if (otherParticipant) {
      SocketService.emitToUser(otherParticipant.userId, 'message:new', payload);

      // Send offline notification if receiver is not actively connected
      const isOnline = SocketService.isUserOnline(otherParticipant.userId);
      if (!isOnline) {
        const senderName = `${message.sender.firstName} ${message.sender.lastName || ''}`.trim();
        await NotificationService.send({
          userId: otherParticipant.userId,
          type: 'SYSTEM',
          title: `💬 New message from ${senderName}`,
          message: inspection.sanitizedContent.substring(0, 120),
          actionUrl: `/chat?thread=${conversationId}`,
        }).catch(() => {});
      }
    }

    return payload;
  }

  /**
   * Soft deletes a message sent by the user
   */
  public static async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderUserId !== userId) {
      throw new Error('Unauthorized: You can only delete your own messages');
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    SocketService.emitToConversation(message.chatThreadId, 'message:deleted', {
      messageId,
      conversationId: message.chatThreadId,
    });

    return updated;
  }
}
