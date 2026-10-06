import { prisma } from '../lib/prisma';

export class BlockService {
  /**
   * Blocks a user and pauses conversation actions
   */
  public static async blockUser(
    blockerUserId: string,
    params: { blockedUserId: string; conversationId?: string; reason?: string }
  ) {
    const { blockedUserId, conversationId, reason } = params;

    if (blockerUserId === blockedUserId) {
      throw new Error('You cannot block yourself');
    }

    const block = await prisma.conversationBlock.upsert({
      where: {
        blockerUserId_blockedUserId: {
          blockerUserId,
          blockedUserId,
        },
      },
      update: {
        reason: reason || null,
        chatThreadId: conversationId || null,
      },
      create: {
        blockerUserId,
        blockedUserId,
        chatThreadId: conversationId || null,
        reason: reason || null,
      },
    });

    if (conversationId) {
      await prisma.chatParticipant.updateMany({
        where: { chatThreadId: conversationId, userId: blockedUserId },
        data: { isBlocked: true },
      });

      await prisma.chatThread.update({
        where: { id: conversationId },
        data: { status: 'BLOCKED' },
      });
    }

    return block;
  }

  /**
   * Unblocks a user
   */
  public static async unblockUser(blockerUserId: string, blockedUserId: string) {
    await prisma.conversationBlock.deleteMany({
      where: {
        blockerUserId,
        blockedUserId,
      },
    });

    // Restore any linked conversation participant
    await prisma.chatParticipant.updateMany({
      where: { userId: blockedUserId },
      data: { isBlocked: false },
    });

    return { success: true };
  }

  /**
   * Checks if communication between two users is blocked in either direction
   */
  public static async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    const count = await prisma.conversationBlock.count({
      where: {
        OR: [
          { blockerUserId: userAId, blockedUserId: userBId },
          { blockerUserId: userBId, blockedUserId: userAId },
        ],
      },
    });

    return count > 0;
  }

  /**
   * Returns directional block details
   */
  public static async getBlockStatus(userId: string, otherUserId: string) {
    const [blockedByMe, blockedByThem] = await Promise.all([
      prisma.conversationBlock.findFirst({
        where: { blockerUserId: userId, blockedUserId: otherUserId },
      }),
      prisma.conversationBlock.findFirst({
        where: { blockerUserId: otherUserId, blockedUserId: userId },
      }),
    ]);

    return {
      isBlocked: !!(blockedByMe || blockedByThem),
      isBlockedByMe: !!blockedByMe,
      isBlockedByThem: !!blockedByThem,
    };
  }
}
