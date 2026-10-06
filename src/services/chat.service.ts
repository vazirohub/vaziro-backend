import { prisma } from '../lib/prisma';
import { BlockService } from './block.service';

export interface GetConversationsOptions {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class ChatService {
  /**
   * Retrieves list of conversations for a user with unread counts,
   * participant metadata, and linked job status.
   */
  public static async getConversations(userId: string, options: GetConversationsOptions = {}) {
    const { status, search, limit = 30, offset = 0 } = options;

    const participantWhere: any = { userId };
    if (status === 'ARCHIVED') {
      participantWhere.isArchived = true;
    } else if (status === 'ACTIVE') {
      participantWhere.isArchived = false;
    }

    const threads = await prisma.chatThread.findMany({
      where: {
        participants: {
          some: participantWhere,
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
                roles: { select: { role: { select: { name: true } } } },
                professionalProfile: {
                  select: {
                    id: true,
                    slug: true,
                    title: true,
                    avatarUrl: true,
                    isVerified: true,
                    rating: true,
                    verification: {
                      select: { status: true },
                    },
                  },
                },
              },
            },
          },
        },
        job: {
          select: {
            id: true,
            status: true,
            agreedPrice: true,
            requirement: { select: { id: true, title: true } },
          },
        },
        requirement: {
          select: { id: true, title: true, status: true },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, firstName: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: offset,
      take: limit,
    });

    // Calculate unread counts and format
    const formatted = await Promise.all(
      threads.map(async (thread) => {
        const myParticipant = thread.participants.find((p) => p.userId === userId);
        const otherParticipant = thread.participants.find((p) => p.userId !== userId);

        const lastRead = myParticipant?.lastReadAt || myParticipant?.joinedAt || new Date(0);

        const unreadCount = await prisma.message.count({
          where: {
            chatThreadId: thread.id,
            senderUserId: { not: userId },
            createdAt: { gt: lastRead },
            deletedAt: null,
          },
        });

        const isBlocked = otherParticipant?.userId
          ? await BlockService.isBlocked(userId, otherParticipant.userId)
          : false;

        const otherProf = otherParticipant?.user?.professionalProfile;
        const isVerified = !!(otherProf?.isVerified && otherProf?.verification?.status === 'VERIFIED');

        return {
          id: thread.id,
          jobId: thread.jobId,
          requirementId: thread.requirementId,
          job: thread.job
            ? {
                id: thread.job.id,
                status: thread.job.status,
                agreedPrice: thread.job.agreedPrice,
                title: thread.job.requirement?.title || 'Contract Job',
              }
            : null,
          requirement: thread.requirement,
          status: thread.status,
          isArchived: !!myParticipant?.isArchived,
          isBlocked,
          unreadCount,
          lastMessage: thread.messages[0]
            ? {
                id: thread.messages[0].id,
                content: thread.messages[0].content,
                messageType: thread.messages[0].messageType,
                createdAt: thread.messages[0].createdAt,
                senderName: thread.messages[0].sender.firstName,
                isMe: thread.messages[0].senderUserId === userId,
              }
            : null,
          otherParticipant: otherParticipant
            ? {
                id: otherParticipant.user.id,
                name: `${otherParticipant.user.firstName} ${otherParticipant.user.lastName || ''}`.trim(),
                firstName: otherParticipant.user.firstName,
                avatarUrl: otherProf?.avatarUrl || null,
                isVerified,
                title: otherProf?.title || 'User',
                roles: otherParticipant.user.roles.map((r) => r.role.name),
              }
            : null,
          updatedAt: thread.updatedAt,
        };
      })
    );

    // Apply optional search filter
    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      return formatted.filter(
        (t) =>
          t.otherParticipant?.name.toLowerCase().includes(q) ||
          t.job?.title.toLowerCase().includes(q) ||
          t.requirement?.title.toLowerCase().includes(q) ||
          t.lastMessage?.content.toLowerCase().includes(q)
      );
    }

    return formatted;
  }

  /**
   * Retrieves conversation by ID with membership authorization check
   */
  public static async getConversationById(conversationId: string, userId: string, isAdmin = false) {
    const thread = await prisma.chatThread.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                professionalProfile: {
                  select: {
                    id: true,
                    slug: true,
                    title: true,
                    avatarUrl: true,
                    isVerified: true,
                    rating: true,
                    verification: { select: { status: true } },
                  },
                },
              },
            },
          },
        },
        job: {
          select: {
            id: true,
            status: true,
            agreedPrice: true,
            requirement: { select: { id: true, title: true } },
          },
        },
        requirement: {
          select: { id: true, title: true, status: true },
        },
      },
    });

    if (!thread) {
      throw new Error('Conversation not found');
    }

    const isParticipant = thread.participants.some((p) => p.userId === userId);
    if (!isParticipant && !isAdmin) {
      throw new Error('Unauthorized to access this conversation');
    }

    const otherParticipant = thread.participants.find((p) => p.userId !== userId);
    const isBlocked = otherParticipant?.userId
      ? await BlockService.isBlocked(userId, otherParticipant.userId)
      : false;

    return {
      ...thread,
      isBlocked,
    };
  }

  /**
   * Creates or returns existing conversation for a Job / Requirement
   */
  public static async getOrCreateConversation(
    currentUserId: string,
    params: { jobId?: string; requirementId?: string; otherUserId: string }
  ) {
    const { jobId, requirementId, otherUserId } = params;

    if (currentUserId === otherUserId) {
      throw new Error('Cannot start conversation with yourself');
    }

    // Check if a thread already exists for this job
    if (jobId) {
      const existingJobThread = await prisma.chatThread.findUnique({
        where: { jobId },
        include: { participants: true },
      });

      if (existingJobThread) {
        // Ensure both users are participants
        const pIds = new Set(existingJobThread.participants.map((p) => p.userId));
        if (!pIds.has(currentUserId)) {
          await prisma.chatParticipant.create({
            data: { chatThreadId: existingJobThread.id, userId: currentUserId },
          }).catch(() => {});
        }
        if (!pIds.has(otherUserId)) {
          await prisma.chatParticipant.create({
            data: { chatThreadId: existingJobThread.id, userId: otherUserId },
          }).catch(() => {});
        }
        return existingJobThread;
      }
    }

    // Check if there is an existing thread between these two users
    const existingThreads = await prisma.chatThread.findMany({
      where: {
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: otherUserId } } },
          jobId ? { jobId } : {},
          requirementId ? { requirementId } : {},
        ],
      },
      include: { participants: true },
    });

    if (existingThreads.length > 0) {
      return existingThreads[0];
    }

    // Create new ChatThread
    const newThread = await prisma.chatThread.create({
      data: {
        jobId: jobId || null,
        requirementId: requirementId || null,
        status: 'ACTIVE',
        participants: {
          create: [
            { userId: currentUserId },
            { userId: otherUserId },
          ],
        },
      },
      include: { participants: true },
    });

    // Add initial system guidance message
    await prisma.message.create({
      data: {
        chatThreadId: newThread.id,
        senderUserId: currentUserId,
        messageType: 'SYSTEM',
        status: 'DELIVERED',
        content:
          'Conversation started on Vaziro. For your security and Payment Protection guarantee, please keep all discussions and transactions on the platform.',
      },
    }).catch(() => {});

    return newThread;
  }

  /**
   * Sets archive status for a conversation participant
   */
  public static async setArchiveStatus(conversationId: string, userId: string, isArchived: boolean) {
    return prisma.chatParticipant.updateMany({
      where: { chatThreadId: conversationId, userId },
      data: { isArchived },
    });
  }
}
