import { prisma } from '../lib/prisma';
import { config } from '../config';

export interface BatchAllocation {
  batchId: string;
  deductedPurchased: number;
  deductedBonus: number;
  totalDeducted: number;
}

export class CreditService {
  /**
   * Master Specification Formula (Section 10, 11, 12):
   * 1 Credit = ₹10
   * Application cost = 10% of customer's stated budget, converted into Credits.
   * Credits Charged = MAX( 1, CEILING(Customer Budget × 10% ÷ ₹10) )
   * Equivalent: MAX(1, CEILING(Customer Budget / 100))
   * Always whole numbers.
   */
  static async calculateFee(budgetMin: number, budgetMax?: number | null): Promise<number> {
    const effectiveBudget = budgetMax && budgetMax > budgetMin ? budgetMax : budgetMin;

    if (!effectiveBudget || effectiveBudget <= 0 || isNaN(effectiveBudget)) {
      return 1;
    }

    // Decimal-safe integer computation: 1 Credit = ₹10, 10% of budget = budget / 100
    let credits = Math.max(1, Math.ceil(effectiveBudget / 100));

    // Optional admin maximum cap check if configured
    try {
      const settingMax = await prisma.systemSetting.findUnique({
        where: { key: 'maximum_application_credits' },
      });
      if (settingMax) {
        const maxCap = parseInt(settingMax.value, 10);
        if (maxCap > 0 && credits > maxCap) {
          credits = maxCap;
        }
      }
    } catch {
      // Fallback silently if system setting table is unavailable
    }

    return credits;
  }

  /**
   * Pure deterministic calculation helper for tests and offline computations
   */
  static calculateFeePure(budgetMin: number, budgetMax?: number | null): number {
    const effectiveBudget = budgetMax && budgetMax > budgetMin ? budgetMax : budgetMin;
    if (!effectiveBudget || effectiveBudget <= 0 || isNaN(effectiveBudget)) {
      return 1;
    }
    return Math.max(1, Math.ceil(effectiveBudget / 100));
  }

  /**
   * Get or initialize CreditWallet for a professional with starter batch.
   */
  static async getOrCreateWallet(professionalProfileId: string) {
    let wallet = await prisma.creditWallet.findUnique({
      where: { professionalProfileId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!wallet) {
      wallet = await prisma.creditWallet.create({
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

      // Initial welcome promotional batch (valid for 90 days)
      const initialExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const welcomeBatch = await prisma.creditBatch.create({
        data: {
          professionalProfileId,
          batchType: 'PROMOTIONAL',
          purchasedCredits: 0,
          bonusCredits: 10,
          remainingPurchasedCredits: 0,
          remainingBonusCredits: 10,
          grantedAt: new Date(),
          expiresAt: initialExpiresAt,
          status: 'ACTIVE',
        },
      });

      await prisma.creditLedger.create({
        data: {
          professionalProfileId,
          creditBatchId: welcomeBatch.id,
          transactionType: 'BONUS_CREDIT',
          amount: 10,
          balanceBefore: 0,
          balanceAfter: 10,
          reason: 'Welcome bonus: 10 promotional credits for new service professional',
        },
      });

      await prisma.creditTransaction.create({
        data: {
          creditWalletId: wallet.id,
          amount: 10,
          balanceAfter: 10,
          transactionType: 'PROMOTIONAL_CREDIT',
          notes: 'Welcome bonus: 10 promotional credits to start quoting on Vaziro',
        },
      });
    }

    return wallet;
  }

  /**
   * Get comprehensive real-time dashboard breakdown (Section 60)
   */
  static async getDetailedWallet(professionalProfileId: string) {
    const wallet = await this.getOrCreateWallet(professionalProfileId);

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [activeBatches, refundPendingBatches, refundedApps, latestLedger, latestPlanPurchase] = await Promise.all([
      prisma.creditBatch.findMany({
        where: {
          professionalProfileId,
          status: 'ACTIVE',
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: 'asc' },
      }),
      prisma.creditBatch.findMany({
        where: {
          professionalProfileId,
          status: 'REFUND_PENDING',
        },
      }),
      prisma.application.aggregate({
        where: {
          professionalProfileId,
          isRefunded: true,
        },
        _sum: { creditsRefunded: true },
      }),
      prisma.creditLedger.findMany({
        where: { professionalProfileId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.planPurchase.findFirst({
        where: {
          professionalProfileId,
          status: 'COMPLETED',
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    let purchasedCredits = 0;
    let bonusCredits = 0;
    let expiringCredits = 0;
    let nextExpiryDate: Date | null = null;

    for (const b of activeBatches) {
      purchasedCredits += b.remainingPurchasedCredits;
      bonusCredits += b.remainingBonusCredits;

      if (!nextExpiryDate || b.expiresAt < nextExpiryDate) {
        nextExpiryDate = b.expiresAt;
      }

      if (b.expiresAt <= thirtyDaysFromNow) {
        expiringCredits += b.remainingPurchasedCredits + b.remainingBonusCredits;
      }
    }

    const refundableCredits = purchasedCredits;
    const refundableAmountInr = refundableCredits * 10; // 1 Credit = ₹10
    const visibilityTier = latestPlanPurchase?.plan?.visibilityTier || 'STANDARD';
    const creditsPendingRefund = refundPendingBatches.reduce((acc, b) => acc + b.remainingPurchasedCredits, 0);
    const creditsRefunded = refundedApps._sum.creditsRefunded || 0;

    return {
      walletId: wallet.id,
      balance: wallet.balance,
      availableCredits: wallet.balance,
      creditValueInr: wallet.balance * 10,
      purchasedCredits,
      bonusCredits,
      expiringCredits,
      creditsExpiringSoon: expiringCredits,
      nextExpiryDate,
      refundableCredits,
      refundableAmountInr,
      creditsPendingRefund,
      creditsRefunded,
      creditsUsed: wallet.lifetimeSpent,
      visibilityTier,
      activeBatchesCount: activeBatches.length,
      activeBatches,
      recentLedger: latestLedger,
      lifetimePurchased: wallet.lifetimePurchased,
      lifetimeSpent: wallet.lifetimeSpent,
    };
  }

  /**
   * Atomic, FIFO / Expiry-Aware Deduction (Section 21, 22, 58, 59)
   * Consumes soonest-expiring credits first.
   * Can participate in caller's Prisma transaction (customTx) for atomic all-or-nothing rollback.
   */
  static async deductCreditsForApplication(
    professionalProfileId: string,
    requirementId: string,
    creditsCost: number,
    customTx?: any
  ) {
    const executeDeduction = async (tx: any) => {
      // 1. Get or create wallet inside transaction
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
        throw new Error(
          `Insufficient credits. This requirement requires ${creditsCost} credits, but your available balance is ${wallet.balance}. Please get a Professional Plan to apply.`
        );
      }

      const balanceBefore = wallet.balance;
      const newBalance = wallet.balance - creditsCost;

      // 2. Fetch active batches ordered by expiresAt ASC (FIFO / expiry-aware)
      const activeBatches = await tx.creditBatch.findMany({
        where: {
          professionalProfileId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        orderBy: [{ expiresAt: 'asc' }, { grantedAt: 'asc' }],
      });

      let remainingToDeduct = creditsCost;
      const batchAllocations: BatchAllocation[] = [];

      for (const batch of activeBatches) {
        if (remainingToDeduct <= 0) break;

        const availableInBatch = batch.remainingBonusCredits + batch.remainingPurchasedCredits;
        if (availableInBatch <= 0) continue;

        let deductedBonus = 0;
        let deductedPurchased = 0;

        // Deduct bonus (promotional) first within batch to protect refundable paid credits
        if (batch.remainingBonusCredits > 0) {
          const takeBonus = Math.min(batch.remainingBonusCredits, remainingToDeduct);
          deductedBonus += takeBonus;
          remainingToDeduct -= takeBonus;
        }

        if (remainingToDeduct > 0 && batch.remainingPurchasedCredits > 0) {
          const takePurchased = Math.min(batch.remainingPurchasedCredits, remainingToDeduct);
          deductedPurchased += takePurchased;
          remainingToDeduct -= takePurchased;
        }

        const totalFromBatch = deductedBonus + deductedPurchased;
        if (totalFromBatch > 0) {
          batchAllocations.push({
            batchId: batch.id,
            deductedPurchased,
            deductedBonus,
            totalDeducted: totalFromBatch,
          });

          await tx.creditBatch.update({
            where: { id: batch.id },
            data: {
              remainingBonusCredits: batch.remainingBonusCredits - deductedBonus,
              remainingPurchasedCredits: batch.remainingPurchasedCredits - deductedPurchased,
            },
          });
        }
      }

      // 3. Update wallet balance
      const updatedWallet = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          lifetimeSpent: wallet.lifetimeSpent + creditsCost,
        },
      });

      // 4. Record in immutable CreditLedger
      const primaryBatchId = batchAllocations[0]?.batchId || null;
      const ledgerEntry = await tx.creditLedger.create({
        data: {
          professionalProfileId,
          creditBatchId: primaryBatchId,
          transactionType: 'APPLICATION_DEBIT',
          direction: 'DEBIT',
          amount: -creditsCost,
          balanceBefore,
          balanceAfter: newBalance,
          referenceEntityId: requirementId,
          requirementId,
          reason: `Application submitted for Requirement #${requirementId.substring(0, 8)}`,
          status: 'COMPLETED',
        },
      });

      // 5. Also record in legacy CreditTransaction for backward compatibility
      await tx.creditTransaction.create({
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
        creditsDeducted: creditsCost,
        balanceRemaining: newBalance,
        batchAllocations,
        ledgerEntry,
      };
    };

    if (customTx) {
      return await executeDeduction(customTx);
    }
    return await prisma.$transaction(executeDeduction);
  }

  /**
   * Fulfill a Professional Plan Purchase (Section 13, 14, 15, 44)
   * Creates PlanPurchase, CreditBatch (with 90-day expiry), and CreditLedger records.
   */
  static async fulfillPlanPurchase(
    professionalProfileId: string,
    planId: string,
    paymentDetails: {
      paymentId?: string;
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      amountPaid?: number;
    } = {}
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch authoritative plan details from database
      let plan = await tx.professionalPlan.findFirst({
        where: {
          OR: [{ id: planId }, { slug: planId }, { name: planId }],
          isActive: true,
        },
      });

      // Fallback to legacy CreditPlan if not found
      if (!plan) {
        const legacyPlan = await tx.creditPlan.findFirst({
          where: {
            OR: [{ id: planId }, { name: planId }],
            isActive: true,
          },
        });
        if (!legacyPlan) {
          throw new Error('Professional plan not found or inactive.');
        }

        // Map legacy plan into standard professional plan structure
        plan = {
          id: legacyPlan.id,
          name: legacyPlan.name,
          slug: legacyPlan.name.toLowerCase(),
          price: legacyPlan.price,
          baseCredits: legacyPlan.creditsCount,
          bonusCredits: 0,
          totalCredits: legacyPlan.creditsCount,
          visibilityTier: 'STANDARD',
          description: legacyPlan.perks,
          isPopular: legacyPlan.isRecommended,
          isActive: true,
          displayOrder: 1,
          createdAt: legacyPlan.createdAt,
          updatedAt: legacyPlan.updatedAt,
        };
      }

      // Idempotency: Prevent duplicate credit awards for the exact same Razorpay payment ID
      if (paymentDetails.razorpayPaymentId) {
        const existingPurchase = await tx.planPurchase.findFirst({
          where: {
            razorpayPaymentId: paymentDetails.razorpayPaymentId,
            status: 'COMPLETED',
          },
        });
        if (existingPurchase) {
          const currentWallet = await tx.creditWallet.findUnique({
            where: { professionalProfileId },
          });
          return {
            wallet: currentWallet,
            purchase: existingPurchase,
            isDuplicateIgnored: true,
          };
        }
      }

      // 2. Get or initialize wallet
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

      const balanceBefore = wallet.balance;
      const totalToAdd = plan.totalCredits;
      const newBalance = wallet.balance + totalToAdd;

      // 3. Create PlanPurchase record
      const purchase = await tx.planPurchase.create({
        data: {
          professionalProfileId,
          planId: plan.id,
          amountPaid: paymentDetails.amountPaid || plan.price,
          currency: 'INR',
          baseCreditsAwarded: plan.baseCredits,
          bonusCreditsAwarded: plan.bonusCredits,
          totalCreditsAwarded: plan.totalCredits,
          paymentId: paymentDetails.paymentId,
          razorpayOrderId: paymentDetails.razorpayOrderId,
          razorpayPaymentId: paymentDetails.razorpayPaymentId,
          status: 'COMPLETED',
        },
      });

      // 4. Create 90-Day CreditBatch (Section 15, 18)
      const grantedAt = new Date();
      const expiresAt = new Date(grantedAt.getTime() + 90 * 24 * 60 * 60 * 1000); // Exactly 90 days

      const batch = await tx.creditBatch.create({
        data: {
          professionalProfileId,
          planPurchaseId: purchase.id,
          batchType: 'PURCHASED',
          purchasedCredits: plan.baseCredits,
          bonusCredits: plan.bonusCredits,
          remainingPurchasedCredits: plan.baseCredits,
          remainingBonusCredits: plan.bonusCredits,
          grantedAt,
          expiresAt,
          status: 'ACTIVE',
          originalPlanPricePaise: Math.round(plan.price * 100),
        },
      });

      // 5. Update wallet
      const updatedWallet = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          lifetimePurchased: wallet.lifetimePurchased + totalToAdd,
        },
      });

      // 6. Record in immutable CreditLedger (Section 20)
      // A. Base Credits
      let runningBalance = balanceBefore + plan.baseCredits;
      await tx.creditLedger.create({
        data: {
          professionalProfileId,
          creditBatchId: batch.id,
          transactionType: 'PLAN_PURCHASE',
          amount: plan.baseCredits,
          balanceBefore,
          balanceAfter: runningBalance,
          referenceEntityId: purchase.id,
          reason: `Purchased ${plan.name} Plan: +${plan.baseCredits} Base Credits (90-day validity)`,
        },
      });

      // B. Bonus Credits (if any)
      if (plan.bonusCredits > 0) {
        await tx.creditLedger.create({
          data: {
            professionalProfileId,
            creditBatchId: batch.id,
            transactionType: 'BONUS_CREDIT',
            amount: plan.bonusCredits,
            balanceBefore: runningBalance,
            balanceAfter: newBalance,
            referenceEntityId: purchase.id,
            reason: `Promotional bonus: +${plan.bonusCredits} Bonus Credits included with ${plan.name} Plan`,
          },
        });
      }

      // 7. Legacy CreditTransaction for backward compatibility
      await tx.creditTransaction.create({
        data: {
          creditWalletId: wallet.id,
          amount: totalToAdd,
          balanceAfter: newBalance,
          transactionType: 'PLAN_CREDIT',
          referenceEntityId: purchase.id,
          notes: `Purchased ${plan.name} Plan: +${totalToAdd} Credits (₹${plan.price})`,
        },
      });

      return {
        wallet: updatedWallet,
        purchase,
        batch,
      };
    });
  }

  /**
   * 90-Day Credit Expiration & Refund Worker / Job (Section 23, 24, 25, 100)
   * Scans expired batches, computes refundable purchased credits (₹10/credit),
   * updates status, removes expired amounts from usable balance, and logs in ledger.
   * Safe to run repeatedly (Idempotent).
   */
  static async processExpiredBatches(cutoffDate?: Date) {
    const targetDate = cutoffDate || new Date();

    const expiredBatches = await prisma.creditBatch.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: targetDate },
      },
      include: {
        professional: {
          include: { creditWallet: true },
        },
        planPurchase: true,
      },
    });

    const results = [];

    for (const batch of expiredBatches) {
      const batchResult = await prisma.$transaction(async (tx) => {
        // Re-check status inside tx for idempotency
        const freshBatch = await tx.creditBatch.findUnique({
          where: { id: batch.id },
        });

        if (!freshBatch || freshBatch.status !== 'ACTIVE') {
          return null;
        }

        const refundableCredits = freshBatch.remainingPurchasedCredits;
        const nonRefundableBonus = freshBatch.remainingBonusCredits;
        const totalToRemove = refundableCredits + nonRefundableBonus;

        const wallet = await tx.creditWallet.findUnique({
          where: { professionalProfileId: batch.professionalProfileId },
        });

        if (!wallet) return null;

        const balanceBefore = wallet.balance;
        const newBalance = Math.max(0, wallet.balance - totalToRemove);

        const refundAmountPaise = refundableCredits * 10 * 100; // 1 Credit = ₹10 = 1000 paise

        const newStatus = refundableCredits > 0 ? 'REFUND_PENDING' : 'EXPIRED_NON_REFUNDABLE';

        // 1. Update batch status and amounts
        const updatedBatch = await tx.creditBatch.update({
          where: { id: batch.id },
          data: {
            status: newStatus,
            remainingPurchasedCredits: 0,
            remainingBonusCredits: 0,
            refundAmountPaise,
          },
        });

        // 2. Decrement wallet balance
        const updatedWallet = await tx.creditWallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance },
        });

        // 3. Record in CreditLedger
        if (refundableCredits > 0) {
          await tx.creditLedger.create({
            data: {
              professionalProfileId: batch.professionalProfileId,
              creditBatchId: batch.id,
              transactionType: 'REFUND',
              amount: -refundableCredits,
              balanceBefore,
              balanceAfter: balanceBefore - refundableCredits,
              referenceEntityId: batch.id,
              reason: `90-day expiry: ${refundableCredits} unused purchased credits eligible for ₹${refundableCredits * 10} refund`,
            },
          });
        }

        if (nonRefundableBonus > 0) {
          await tx.creditLedger.create({
            data: {
              professionalProfileId: batch.professionalProfileId,
              creditBatchId: batch.id,
              transactionType: 'EXPIRATION',
              amount: -nonRefundableBonus,
              balanceBefore: balanceBefore - refundableCredits,
              balanceAfter: newBalance,
              referenceEntityId: batch.id,
              reason: `90-day expiry: ${nonRefundableBonus} unused promotional bonus credits expired (non-refundable)`,
            },
          });
        }

        // 4. Create internal CreditRefund record
        if (refundableCredits > 0) {
          await tx.creditRefund.create({
            data: {
              creditWalletId: wallet.id,
              requirementId: batch.id,
              creditsCount: refundableCredits,
              status: 'ELIGIBLE',
              reason: `90-day validity expired. Eligible refund: ₹${refundableCredits * 10}`,
            },
          });
        }

        return {
          batchId: batch.id,
          professionalProfileId: batch.professionalProfileId,
          refundableCredits,
          nonRefundableBonus,
          refundAmountInr: refundableCredits * 10,
          status: newStatus,
        };
      });

      if (batchResult) {
        results.push(batchResult);
      }
    }

    return {
      processedCount: results.length,
      totalRefundableInr: results.reduce((acc, r) => acc + r.refundAmountInr, 0),
      batches: results,
    };
  }

  /**
   * Safe credit refund for cancelled requirements or customer withdrawals (Section 78)
   */
  static async refundCreditsForCancellation(
    professionalProfileId: string,
    requirementId: string,
    creditsToRefund: number,
    reason: string
  ) {
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.creditWallet.findUnique({
        where: { professionalProfileId },
      });

      if (!wallet) throw new Error('Wallet not found for professional');

      const balanceBefore = wallet.balance;
      const newBalance = wallet.balance + creditsToRefund;

      await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          lifetimeSpent: Math.max(0, wallet.lifetimeSpent - creditsToRefund),
        },
      });

      const ledger = await tx.creditLedger.create({
        data: {
          professionalProfileId,
          transactionType: 'APPLICATION_REFUND',
          amount: creditsToRefund,
          balanceBefore,
          balanceAfter: newBalance,
          referenceEntityId: requirementId,
          reason: `Requirement cancellation reversal: ${reason}`,
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

      return { newBalance, ledger };
    });
  }

  // Alias for backward compatibility
  static async purchasePlan(professionalProfileId: string, planId: string, customPaymentId?: string) {
    return await this.fulfillPlanPurchase(professionalProfileId, planId, {
      paymentId: customPaymentId,
      razorpayPaymentId: customPaymentId,
    });
  }

  static async refundCredits(
    professionalProfileId: string,
    creditsToRefund: number,
    requirementId: string,
    reason: string
  ) {
    return await this.refundCreditsForCancellation(
      professionalProfileId,
      requirementId,
      creditsToRefund,
      reason
    );
  }

  /**
   * Automatically refunds all professionals who spent credits applying to a requirement that got cancelled (Section 23, 78)
   */
  static async refundAllApplicationsForRequirement(requirementId: string, reason: string = 'CUSTOMER_CANCELLED') {
    const applications = await prisma.application.findMany({
      where: { requirementId, isRefunded: false, creditsSpent: { gt: 0 } },
    });

    const results = [];
    for (const app of applications) {
      try {
        const res = await this.refundApplication(app.id, reason);
        results.push(res);
      } catch (err: any) {
        console.error(`Failed to refund professional application ${app.id} for requirement ${requirementId}:`, err);
      }
    }
    return results;
  }

  /**
   * Idempotently and atomically refund credits spent on an application (Sections 4, 5, 6)
   */
  static async refundApplication(
    applicationId: string,
    reason: string = 'NOT_SELECTED',
    customTx?: any
  ) {
    const executeRefund = async (tx: any) => {
      // 1. Fetch application with relation context
      const app = await tx.application.findUnique({
        where: { id: applicationId },
        include: {
          requirement: true,
          professional: true,
        },
      });

      if (!app) {
        throw new Error('Application not found.');
      }

      // Idempotency: single application can only receive refund once
      if (app.isRefunded || app.refundStatus === 'REFUNDED') {
        return {
          alreadyRefunded: true,
          creditsRefunded: app.creditsRefunded,
          application: app,
        };
      }

      const creditsToRefund = app.creditsSpent || app.creditsCharged || 0;
      if (creditsToRefund <= 0) {
        const updatedApp = await tx.application.update({
          where: { id: applicationId },
          data: {
            isRefunded: true,
            refundStatus: 'REFUNDED',
            creditsRefunded: 0,
            refundReason: reason,
            refundedAt: new Date(),
          },
        });
        return { alreadyRefunded: false, creditsRefunded: 0, application: updatedApp };
      }

      // 2. Fetch or initialize professional wallet
      let wallet = await tx.creditWallet.findUnique({
        where: { professionalProfileId: app.professionalProfileId },
      });

      if (!wallet) {
        wallet = await tx.creditWallet.create({
          data: {
            professionalProfileId: app.professionalProfileId,
            balance: 0,
            lifetimePurchased: 0,
            lifetimeSpent: 0,
          },
        });
      }

      const balanceBefore = wallet.balance;
      const newBalance = balanceBefore + creditsToRefund;

      // 3. Atomically restore credits in wallet
      const updatedWallet = await tx.creditWallet.update({
        where: { id: wallet.id },
        data: {
          balance: newBalance,
          lifetimeSpent: Math.max(0, wallet.lifetimeSpent - creditsToRefund),
        },
      });

      // 4. Update application state
      const updatedApp = await tx.application.update({
        where: { id: applicationId },
        data: {
          isRefunded: true,
          refundStatus: 'REFUNDED',
          creditsRefunded: creditsToRefund,
          refundReason: reason,
          refundedAt: new Date(),
        },
      });

      // 5. Restore batch credits if snapshot available
      let primaryBatchId: string | null = null;
      if (app.batchAllocation) {
        try {
          const allocations: BatchAllocation[] = JSON.parse(app.batchAllocation);
          for (const alloc of allocations) {
            const batch = await tx.creditBatch.findUnique({ where: { id: alloc.batchId } });
            if (batch && batch.status === 'ACTIVE') {
              await tx.creditBatch.update({
                where: { id: batch.id },
                data: {
                  remainingPurchasedCredits: batch.remainingPurchasedCredits + alloc.deductedPurchased,
                  remainingBonusCredits: batch.remainingBonusCredits + alloc.deductedBonus,
                },
              });
              if (!primaryBatchId) primaryBatchId = batch.id;
            }
          }
        } catch {
          // ignore batch parse failure
        }
      }

      // 6. Record in immutable CreditLedger
      const friendlyReason =
        reason === 'NOT_SELECTED'
          ? `Credits Refunded: Professional not selected for "${app.requirement?.title || 'Requirement'}"`
          : reason === 'REQUIREMENT_EXPIRED'
          ? `Credits Refunded: Requirement expired without hiring for "${app.requirement?.title || 'Requirement'}"`
          : `Credits Refunded: ${reason}`;

      const ledgerEntry = await tx.creditLedger.create({
        data: {
          professionalProfileId: app.professionalProfileId,
          creditBatchId: primaryBatchId,
          transactionType: 'APPLICATION_REFUND',
          direction: 'CREDIT',
          amount: creditsToRefund,
          balanceBefore,
          balanceAfter: newBalance,
          referenceEntityId: app.requirementId,
          requirementId: app.requirementId,
          applicationId: app.id,
          reason: friendlyReason,
          status: 'COMPLETED',
        },
      });

      // 7. Legacy CreditTransaction for backward compatibility
      await tx.creditTransaction.create({
        data: {
          creditWalletId: wallet.id,
          amount: creditsToRefund,
          balanceAfter: newBalance,
          transactionType: 'APPLICATION_REFUND',
          referenceEntityId: app.requirementId,
          notes: friendlyReason,
        },
      });

      // 8. Notification to professional
      try {
        const prof = await tx.professionalProfile.findUnique({
          where: { id: app.professionalProfileId },
          select: { userId: true },
        });
        if (prof?.userId) {
          await tx.notification.create({
            data: {
              userId: prof.userId,
              title: 'Credits Refunded',
              message: `+${creditsToRefund} Credits returned to your wallet (${friendlyReason}).`,
              type: 'WALLET_CREDIT_REFUND',
              actionUrl: '/credits',
            },
          });
        }
      } catch {
        // ignore notification errors
      }

      return {
        alreadyRefunded: false,
        creditsRefunded: creditsToRefund,
        balanceRemaining: newBalance,
        application: updatedApp,
        ledgerEntry,
      };
    };

    if (customTx) {
      return await executeRefund(customTx);
    }
    return await prisma.$transaction(executeRefund);
  }

  /**
   * Refund all non-hired applications for a requirement when another candidate is hired (Section 4, 11)
   */
  static async refundNonHiredApplicants(
    requirementId: string,
    hiredProfessionalProfileId: string,
    customTx?: any
  ) {
    const run = async (tx: any) => {
      const nonHiredApplications = await tx.application.findMany({
        where: {
          requirementId,
          professionalProfileId: { not: hiredProfessionalProfileId },
          isRefunded: false,
        },
      });

      const refundResults = [];
      for (const app of nonHiredApplications) {
        const res = await this.refundApplication(app.id, 'NOT_SELECTED', tx);
        refundResults.push(res);
      }
      return refundResults;
    };

    if (customTx) {
      return await run(customTx);
    }
    return await prisma.$transaction(run);
  }

  /**
   * Automatic background worker: Expire unhired requirements and refund all candidate applications (Section 5)
   */
  static async processExpiredRequirements(expiryWindowDays: number = 30) {
    const cutoffDate = new Date(Date.now() - expiryWindowDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    const expiredRequirements = await prisma.requirement.findMany({
      where: {
        status: { in: ['PUBLISHED', 'RECEIVING_QUOTES', 'SHORTLISTED'] },
        OR: [
          { expiresAt: { not: null, lte: now } },
          { expiresAt: null, createdAt: { lte: cutoffDate } },
        ],
      },
      include: {
        applications: {
          where: { isRefunded: false },
        },
      },
    });

    const results = [];
    for (const req of expiredRequirements) {
      const result = await prisma.$transaction(async (tx) => {
        await tx.requirement.update({
          where: { id: req.id },
          data: { status: 'EXPIRED' },
        });

        const appRefunds = [];
        for (const app of req.applications) {
          const refundRes = await this.refundApplication(app.id, 'REQUIREMENT_EXPIRED', tx);
          appRefunds.push(refundRes);
        }

        return {
          requirementId: req.id,
          title: req.title,
          applicationsRefunded: appRefunds.length,
          appRefunds,
        };
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Get complete financial and credit transaction history for a professional (Section 1)
   */
  static async getProfessionalTransactionHistory(
    professionalProfileId: string,
    options: {
      type?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    // 1. Fetch Credit Ledger records
    const ledgerRecords = await prisma.creditLedger.findMany({
      where: { professionalProfileId },
      include: {
        batch: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Extract requirement IDs to fetch titles in bulk
    const requirementIds = Array.from(
      new Set(
        ledgerRecords
          .map((r) => r.requirementId || r.referenceEntityId)
          .filter(Boolean) as string[]
      )
    );

    const requirements = await prisma.requirement.findMany({
      where: { id: { in: requirementIds } },
      select: { id: true, title: true, status: true },
    });
    const reqMap = new Map(requirements.map((r) => [r.id, r]));

    // 2. Fetch Job & Marketplace Payment records for this professional
    const jobs = await prisma.job.findMany({
      where: { professionalProfileId },
      include: {
        requirement: { select: { id: true, title: true } },
        customer: { include: { user: { select: { firstName: true, lastName: true } } } },
        payments: true,
        marketplacePayment: true,
        routeTransfers: true,
        disputes: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 3. Build unified transaction items
    const transactions: any[] = [];

    // Map credit ledgers
    for (const item of ledgerRecords) {
      const req = item.requirementId
        ? reqMap.get(item.requirementId)
        : item.referenceEntityId
        ? reqMap.get(item.referenceEntityId)
        : null;

      let type = item.transactionType;
      let displayType = 'Credit Transaction';
      let direction = item.direction || (item.amount >= 0 ? 'CREDIT' : 'DEBIT');

      if (type === 'APPLICATION_DEBIT') {
        type = 'APPLICATION_CREDIT_DEBIT';
        displayType = 'Credits Used';
      } else if (type === 'APPLICATION_REFUND') {
        type = 'APPLICATION_CREDIT_REFUND';
        displayType = 'Credits Refunded';
      } else if (type === 'PLAN_PURCHASE') {
        type = 'CREDIT_PURCHASE';
        displayType = 'Plan Purchase';
      } else if (type === 'BONUS_CREDIT') {
        type = 'BONUS_CREDIT';
        displayType = 'Bonus Credits';
      } else if (type === 'REFUND') {
        type = 'CREDIT_90_DAY_REFUND';
        displayType = '90-Day Credit Refund';
      } else if (type === 'EXPIRATION') {
        type = 'CREDIT_EXPIRATION';
        displayType = 'Credits Expired';
      } else if (type === 'ADMIN_ADJUSTMENT') {
        type = 'ADMIN_CREDIT_ADJUSTMENT';
        displayType = 'Admin Credit Adjustment';
      }

      transactions.push({
        id: item.id,
        professionalId: professionalProfileId,
        type,
        displayType,
        amount: item.amount >= 0 ? `+${item.amount} Credits` : `${item.amount} Credits`,
        rawAmount: item.amount,
        creditAmount: Math.abs(item.amount),
        currencyAmount: Math.abs(item.amount) * 10,
        direction,
        balanceBefore: item.balanceBefore,
        balanceAfter: item.balanceAfter,
        requirement: req ? { id: req.id, title: req.title } : null,
        applicationId: item.applicationId,
        jobId: item.jobId,
        paymentId: item.paymentId,
        razorpayReference: item.batch?.razorpayRefundId || null,
        reason: item.reason || (direction === 'DEBIT' ? 'Application credit fee' : 'Credit adjustment'),
        status: item.status || 'COMPLETED',
        createdAt: item.createdAt,
        completedAt: item.createdAt,
      });
    }

    // Map financial payment events from jobs
    for (const j of jobs) {
      const req = j.requirement;
      // If payment is secured
      if (
        ['PAYMENT_SECURED', 'READY_FOR_RELEASE', 'SERVICE_COMPLETED', 'CUSTOMER_APPROVED'].includes(
          j.paymentStatus
        ) ||
        j.payments.some((p) => p.status === 'CAPTURED')
      ) {
        const capturedPayment = j.payments.find((p) => p.status === 'CAPTURED');
        transactions.push({
          id: `escrow_${j.id}`,
          professionalId: professionalProfileId,
          type: 'PAYMENT_SECURED',
          displayType: 'Payment Secured (Escrow)',
          amount: `₹${j.agreedPrice.toLocaleString('en-IN')}`,
          rawAmount: j.agreedPrice,
          creditAmount: null,
          currencyAmount: j.agreedPrice,
          direction: 'CREDIT',
          balanceBefore: null,
          balanceAfter: null,
          requirement: req ? { id: req.id, title: req.title } : null,
          jobId: j.id,
          paymentId: capturedPayment?.id || null,
          razorpayReference: capturedPayment?.razorpayPaymentId || null,
          reason: `Customer deposited contract amount of ₹${j.agreedPrice} into Vaziro Escrow Protection`,
          status: 'SECURED',
          createdAt: capturedPayment?.createdAt || j.createdAt,
          completedAt: capturedPayment?.capturedAt || null,
        });
      }

      // If payment is released
      if (j.paymentStatus === 'RELEASED' || j.status === 'PAYMENT_RELEASED' || j.status === 'COMPLETED') {
        const netPayout = j.routeTransfers[0]?.amount
          ? j.routeTransfers[0].amount
          : j.agreedPrice * 0.94;
        transactions.push({
          id: `payout_${j.id}`,
          professionalId: professionalProfileId,
          type: 'PAYMENT_RELEASED',
          displayType: 'Payment Released (Payout)',
          amount: `₹${netPayout.toLocaleString('en-IN')}`,
          rawAmount: netPayout,
          creditAmount: null,
          currencyAmount: netPayout,
          direction: 'CREDIT',
          balanceBefore: null,
          balanceAfter: null,
          requirement: req ? { id: req.id, title: req.title } : null,
          jobId: j.id,
          paymentId: j.marketplacePayment?.paymentId || null,
          razorpayReference: j.routeTransfers[0]?.razorpayTransferId || null,
          reason: `Customer approved work completion and released payment of ₹${netPayout} to your account`,
          status: 'COMPLETED',
          createdAt: j.updatedAt,
          completedAt: j.updatedAt,
        });
      }

      // If disputed
      if (j.paymentStatus === 'DISPUTED' || j.status === 'DISPUTED') {
        transactions.push({
          id: `dispute_${j.id}`,
          professionalId: professionalProfileId,
          type: 'PAYMENT_DISPUTED',
          displayType: 'Payment Disputed (Held)',
          amount: `₹${j.agreedPrice.toLocaleString('en-IN')}`,
          rawAmount: j.agreedPrice,
          creditAmount: null,
          currencyAmount: j.agreedPrice,
          direction: 'DEBIT',
          balanceBefore: null,
          balanceAfter: null,
          requirement: req ? { id: req.id, title: req.title } : null,
          jobId: j.id,
          paymentId: null,
          razorpayReference: null,
          reason: j.disputeReason || j.disputes[0]?.reason || 'Customer reported an issue with delivery',
          status: 'DISPUTED',
          createdAt: j.disputedAt || j.updatedAt,
          completedAt: null,
        });
      }
    }

    // Sort descending by date
    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Filter by type if provided
    let filtered = transactions;
    if (options.type && options.type !== 'ALL') {
      if (options.type === 'CREDITS') {
        filtered = transactions.filter((t) => t.type.includes('CREDIT') || t.type.includes('PLAN'));
      } else if (options.type === 'PAYMENTS') {
        filtered = transactions.filter((t) => t.type.includes('PAYMENT'));
      } else if (options.type === 'REFUNDS') {
        filtered = transactions.filter((t) => t.type.includes('REFUND'));
      }
    }

    const paginated = filtered.slice(offset, offset + limit);

    return {
      total: filtered.length,
      limit,
      offset,
      transactions: paginated,
    };
  }
}

