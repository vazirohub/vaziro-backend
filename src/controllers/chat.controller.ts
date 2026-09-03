import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Regex to detect Indian phone numbers and email addresses
const PHONE_REGEX = /(\+91[\-\s]?)?[6789]\d{9}|\b\d{10}\b|\b\d{5}[\s\-]\d{5}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export class ChatController {
  /**
   * GET /api/v1/chat/threads
   */
  static async getThreads(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const threads = await prisma.chatThread.findMany({
        where: {
          participants: {
            some: { userId },
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          job: {
            select: {
              id: true,
              status: true,
              agreedPrice: true,
              requirement: { select: { title: true } },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: threads.map((t) => ({
          ...t,
          job: t.job ? { ...t.job, finalPrice: t.job.agreedPrice } : null,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch chat threads' },
      });
    }
  }

  /**
   * GET /api/v1/chat/threads/:id/messages
   */
  static async getMessages(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const participant = await prisma.chatParticipant.findFirst({
        where: { chatThreadId: id, userId },
      });

      if (!participant && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
      }

      const messages = await prisma.message.findMany({
        where: { chatThreadId: id },
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return res.status(200).json({
        success: true,
        data: messages.map((m) => ({
          ...m,
          body: m.content,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch messages' },
      });
    }
  }

  /**
   * POST /api/v1/chat/threads/:id/messages
   */
  static async sendMessage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { body, content } = req.body;
      const userId = req.user?.id;

      const messageContent = content || body;

      if (!messageContent || typeof messageContent !== 'string' || messageContent.trim().length === 0) {
        return res.status(400).json({ success: false, error: { message: 'Message content cannot be empty.' } });
      }

      const thread = await prisma.chatThread.findUnique({
        where: { id },
        include: {
          job: true,
          participants: true,
        },
      });

      if (!thread) {
        return res.status(404).json({ success: false, error: { message: 'Thread not found' } });
      }

      const isParticipant = thread.participants.some((p) => p.userId === userId);
      if (!isParticipant && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
      }

      let sanitizedContent = messageContent;
      const isHired = thread.job && ['HIRED', 'SCHEDULED', 'PREPARING', 'ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED', 'CUSTOMER_APPROVED'].includes(thread.job.status);

      if (!isHired) {
        if (PHONE_REGEX.test(messageContent) || EMAIL_REGEX.test(messageContent)) {
          sanitizedContent = messageContent
            .replace(PHONE_REGEX, '[Phone Number Protected by Vaziro - Available After Hiring]')
            .replace(EMAIL_REGEX, '[Email Protected by Vaziro - Available After Hiring]');
        }
      }

      const message = await prisma.message.create({
        data: {
          chatThreadId: id,
          senderUserId: userId!,
          content: sanitizedContent,
          messageType: 'TEXT',
        },
        include: {
          sender: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      await prisma.chatThread.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return res.status(201).json({
        success: true,
        data: {
          ...message,
          body: message.content,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to send message' },
      });
    }
  }
}
