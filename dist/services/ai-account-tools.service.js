"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAccountToolsService = void 0;
const prisma_1 = require("../lib/prisma");
class AIAccountToolsService {
    /**
     * Controlled, read-only account data retrieval for the authenticated user.
     * Exposes only sanitized, minimal facts required for AI explanation.
     * Never allows write or unauthorized cross-account access.
     */
    static async getAccountContextForAI(userId) {
        try {
            const user = (await prisma_1.prisma.user.findUnique({
                where: { id: userId },
                include: {
                    roles: { include: { role: true } },
                    professionalProfile: {
                        include: {
                            creditWallet: {
                                include: {
                                    transactions: {
                                        take: 5,
                                        orderBy: { createdAt: 'desc' },
                                    },
                                    creditRefunds: {
                                        take: 3,
                                        orderBy: { createdAt: 'desc' },
                                    },
                                },
                            },
                        },
                    },
                    customerProfile: {
                        include: {
                            requirements: {
                                take: 5,
                                orderBy: { createdAt: 'desc' },
                                include: {
                                    quotations: { select: { id: true, status: true, proposedPrice: true } },
                                },
                            },
                        },
                    },
                    payments: {
                        take: 3,
                        orderBy: { createdAt: 'desc' },
                    },
                },
            }));
            if (!user) {
                return 'User account record not found.';
            }
            const roleNames = user.roles.map((r) => r.role.name);
            const isPro = roleNames.includes('PROFESSIONAL');
            const parts = [];
            // 1. Identity & Profile
            parts.push(`User: ${user.firstName} ${user.lastName} | Status: ${user.status} | Roles: ${roleNames.join(', ')}`);
            // 2. Professional Wallet & Refund Status
            if (isPro && user.professionalProfile?.creditWallet) {
                const wallet = user.professionalProfile.creditWallet;
                parts.push(`Credit Wallet Balance: ${wallet.balance} credits | Lifetime Purchased: ${wallet.lifetimePurchased} | Lifetime Spent: ${wallet.lifetimeSpent}`);
                if (wallet.transactions.length > 0) {
                    const txList = wallet.transactions
                        .map((t) => `• ${t.transactionType}: ${t.amount > 0 ? '+' : ''}${t.amount} credits (New Balance: ${t.balanceAfter}) on ${new Date(t.createdAt).toLocaleDateString('en-IN')}`)
                        .join('; ');
                    parts.push(`Recent Wallet Transactions: ${txList}`);
                }
                if (wallet.creditRefunds.length > 0) {
                    const refundList = wallet.creditRefunds
                        .map((r) => `• ${r.creditsRefunded} credits (${r.status}) - Reason: ${r.reason} on ${new Date(r.createdAt).toLocaleDateString('en-IN')}`)
                        .join('; ');
                    parts.push(`Recent Credit Refunds: ${refundList}`);
                }
            }
            // 3. Customer Requirements
            if (user.customerProfile?.requirements && user.customerProfile.requirements.length > 0) {
                const reqList = user.customerProfile.requirements
                    .map((r) => `• "${r.title}" (Status: ${r.status}, Budget: ₹${r.minimumBudget || 0}-₹${r.maximumBudget || 0}, ${r.quotations.length} quotes received)`)
                    .join('; ');
                parts.push(`Recent Posted Requirements: ${reqList}`);
            }
            // 4. Payments & Escrow
            if (user.payments && user.payments.length > 0) {
                const payList = user.payments
                    .map((p) => `• ₹${p.amount} (Payment: ${p.status}) on ${new Date(p.createdAt).toLocaleDateString('en-IN')}`)
                    .join('; ');
                parts.push(`Recent Payments: ${payList}`);
            }
            return parts.join('\n');
        }
        catch (error) {
            console.error('[AIAccountToolsService] Error gathering account context:', error.message);
            return 'Account status details temporarily unavailable.';
        }
    }
    /**
     * Helper: Detect if a user prompt is asking about their personal account/wallet/jobs
     */
    static isAccountSpecificQuery(prompt) {
        const p = prompt.toLowerCase();
        const accountKeywords = [
            'my wallet',
            'my credit',
            'my balance',
            'my refund',
            'my money',
            'my job',
            'my requirement',
            'my quote',
            'my application',
            'my payment',
            'my profile',
            'my account',
            'did i get',
            'why was i charged',
            'why did i not get',
            'why didn\'t i get',
            'where is my',
            'how many credits do i have',
            'check my',
        ];
        return accountKeywords.some((keyword) => p.includes(keyword));
    }
}
exports.AIAccountToolsService = AIAccountToolsService;
