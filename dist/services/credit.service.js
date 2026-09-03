"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditService = void 0;
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
class CreditService {
    /**
     * Dynamically calculate credit fee for a requirement based on budget.
     * Default rule: ~5% of customer stated budget.
     * 1 Credit = ₹50 nominal value.
     * Min: 1 credit, Max: 100 credits (configurable in SystemSetting).
     */
    static async calculateFee(budgetMin, budgetMax) {
        const settingFeePct = await prisma_1.prisma.systemSetting.findUnique({
            where: { key: 'application_fee_percentage' },
        });
        const feePct = settingFeePct ? parseFloat(settingFeePct.value) : config_1.config.businessRules.applicationFeePercentage;
        const settingNominal = await prisma_1.prisma.systemSetting.findFirst({
            where: { key: { in: ['credit_value', 'credit_nominal_value'] } },
        });
        const nominalValue = settingNominal ? parseFloat(settingNominal.value) : (config_1.config.businessRules.creditNominalValue || 50.0);
        const settingMin = await prisma_1.prisma.systemSetting.findUnique({
            where: { key: 'minimum_application_credits' },
        });
        const minCredits = settingMin ? parseInt(settingMin.value, 10) : config_1.config.businessRules.minimumApplicationCredits;
        const settingMax = await prisma_1.prisma.systemSetting.findUnique({
            where: { key: 'maximum_application_credits' },
        });
        const maxCredits = settingMax ? parseInt(settingMax.value, 10) : config_1.config.businessRules.maximumApplicationCredits;
        const effectiveBudget = budgetMax && budgetMax > budgetMin ? budgetMax : budgetMin;
        const feeAmountInr = (effectiveBudget * feePct) / 100;
        let credits = Math.round(feeAmountInr / nominalValue);
        if (credits < minCredits)
            credits = minCredits;
        if (credits > maxCredits)
            credits = maxCredits;
        return credits;
    }
    /**
     * Get or initialize CreditWallet for a professional.
     */
    static async getOrCreateWallet(professionalProfileId) {
        let wallet = await prisma_1.prisma.creditWallet.findUnique({
            where: { professionalProfileId },
            include: {
                transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });
        if (!wallet) {
            wallet = await prisma_1.prisma.creditWallet.create({
                data: {
                    professionalProfileId,
                    balance: 10,
                    lifetimePurchased: 0,
                    lifetimeSpent: 0,
                },
                include: {
                    transactions: true,
                },
            });
            await prisma_1.prisma.creditTransaction.create({
                data: {
                    creditWalletId: wallet.id,
                    amount: 10,
                    balanceAfter: 10,
                    transactionType: 'PROMOTIONAL_CREDIT',
                    notes: 'Welcome bonus: 10 free credits to jumpstart your business on Vaziro',
                },
            });
        }
        return wallet;
    }
    /**
     * Atomic deduction of credits for applying to a requirement.
     */
    static async deductCreditsForApplication(professionalProfileId, requirementId, creditsCost) {
        return await prisma_1.prisma.$transaction(async (tx) => {
            let wallet = await tx.creditWallet.findUnique({
                where: { professionalProfileId },
            });
            if (!wallet) {
                wallet = await tx.creditWallet.create({
                    data: {
                        professionalProfileId,
                        balance: 10,
                        lifetimePurchased: 0,
                        lifetimeSpent: 0,
                    },
                });
            }
            if (wallet.balance < creditsCost) {
                throw new Error(`Insufficient credits. Required: ${creditsCost}, Available: ${wallet.balance}. Please purchase a credit plan to apply.`);
            }
            const newBalance = wallet.balance - creditsCost;
            const updatedWallet = await tx.creditWallet.update({
                where: { id: wallet.id },
                data: {
                    balance: newBalance,
                    lifetimeSpent: wallet.lifetimeSpent + creditsCost,
                },
            });
            const transaction = await tx.creditTransaction.create({
                data: {
                    creditWalletId: wallet.id,
                    amount: -creditsCost,
                    balanceAfter: newBalance,
                    transactionType: 'APPLICATION_DEBIT',
                    referenceEntityId: requirementId,
                    notes: `Application fee for requirement #${requirementId.substring(0, 8)}`,
                },
            });
            return {
                wallet: updatedWallet,
                transaction,
                creditsDeducted: creditsCost,
                balanceRemaining: newBalance,
            };
        });
    }
    /**
     * Refund credits to professional
     */
    static async refundCredits(professionalProfileId, creditsToRefund, requirementId, reason) {
        return await prisma_1.prisma.$transaction(async (tx) => {
            const wallet = await tx.creditWallet.findUnique({
                where: { professionalProfileId },
            });
            if (!wallet)
                throw new Error('Wallet not found for professional');
            const newBalance = wallet.balance + creditsToRefund;
            await tx.creditWallet.update({
                where: { id: wallet.id },
                data: {
                    balance: newBalance,
                    lifetimeSpent: Math.max(0, wallet.lifetimeSpent - creditsToRefund),
                },
            });
            const transaction = await tx.creditTransaction.create({
                data: {
                    creditWalletId: wallet.id,
                    amount: creditsToRefund,
                    balanceAfter: newBalance,
                    transactionType: 'APPLICATION_REFUND',
                    referenceEntityId: requirementId,
                    notes: `Refund: ${reason}`,
                },
            });
            await tx.creditRefund.create({
                data: {
                    creditWalletId: wallet.id,
                    requirementId,
                    creditsCount: creditsToRefund,
                    status: 'REFUNDED',
                    reason,
                },
            });
            return { newBalance, transaction };
        });
    }
    /**
     * Purchase a credit plan
     */
    static async purchasePlan(professionalProfileId, planId, customPaymentId) {
        return await prisma_1.prisma.$transaction(async (tx) => {
            const plan = await tx.creditPlan.findUnique({
                where: { id: planId },
            });
            if (!plan || !plan.isActive) {
                throw new Error('Credit plan is inactive or does not exist.');
            }
            let wallet = await tx.creditWallet.findUnique({
                where: { professionalProfileId },
            });
            if (!wallet) {
                wallet = await tx.creditWallet.create({
                    data: {
                        professionalProfileId,
                        balance: 0,
                        lifetimePurchased: 0,
                        lifetimeSpent: 0,
                    },
                });
            }
            const newBalance = wallet.balance + plan.creditsCount;
            const updatedWallet = await tx.creditWallet.update({
                where: { id: wallet.id },
                data: {
                    balance: newBalance,
                    lifetimePurchased: wallet.lifetimePurchased + plan.creditsCount,
                },
            });
            const purchase = await tx.creditPurchase.create({
                data: {
                    creditWalletId: wallet.id,
                    creditPlanId: plan.id,
                    amountPaid: plan.price,
                    creditsAwarded: plan.creditsCount,
                    currency: 'INR',
                    status: 'COMPLETED',
                    paymentId: customPaymentId || `pay_rzp_${Date.now()}`,
                },
            });
            const transaction = await tx.creditTransaction.create({
                data: {
                    creditWalletId: wallet.id,
                    amount: plan.creditsCount,
                    balanceAfter: newBalance,
                    transactionType: 'PLAN_CREDIT',
                    referenceEntityId: purchase.id,
                    notes: `Purchased ${plan.name} Plan: +${plan.creditsCount} Credits for ₹${plan.price}`,
                },
            });
            return {
                wallet: updatedWallet,
                purchase,
                transaction,
            };
        });
    }
}
exports.CreditService = CreditService;
