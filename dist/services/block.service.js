"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockService = void 0;
const prisma_1 = require("../lib/prisma");
class BlockService {
    /**
     * Blocks a user and pauses conversation actions
     */
    static async blockUser(blockerUserId, params) {
        const { blockedUserId, conversationId, reason } = params;
        if (blockerUserId === blockedUserId) {
            throw new Error('You cannot block yourself');
        }
        const block = await prisma_1.prisma.conversationBlock.upsert({
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
            await prisma_1.prisma.chatParticipant.updateMany({
                where: { chatThreadId: conversationId, userId: blockedUserId },
                data: { isBlocked: true },
            });
            await prisma_1.prisma.chatThread.update({
                where: { id: conversationId },
                data: { status: 'BLOCKED' },
            });
        }
        return block;
    }
    /**
     * Unblocks a user
     */
    static async unblockUser(blockerUserId, blockedUserId) {
        await prisma_1.prisma.conversationBlock.deleteMany({
            where: {
                blockerUserId,
                blockedUserId,
            },
        });
        // Restore any linked conversation participant
        await prisma_1.prisma.chatParticipant.updateMany({
            where: { userId: blockedUserId },
            data: { isBlocked: false },
        });
        return { success: true };
    }
    /**
     * Checks if communication between two users is blocked in either direction
     */
    static async isBlocked(userAId, userBId) {
        const count = await prisma_1.prisma.conversationBlock.count({
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
    static async getBlockStatus(userId, otherUserId) {
        const [blockedByMe, blockedByThem] = await Promise.all([
            prisma_1.prisma.conversationBlock.findFirst({
                where: { blockerUserId: userId, blockedUserId: otherUserId },
            }),
            prisma_1.prisma.conversationBlock.findFirst({
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
exports.BlockService = BlockService;
