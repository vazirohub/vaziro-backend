import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { CreditService } from '../services/credit.service';
import { RazorpayService } from '../services/razorpay.service';

export class CreditsController {
  /**
   * GET /api/v1/credits/wallet
   * Returns comprehensive real-time wallet breakdown (Section 60)
   */
  static async getWallet(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const prof = await prisma.professionalProfile.findUnique({
        where: { userId },
      });

      if (!prof) {
        return res.status(404).json({
          success: false,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Professional profile not found for this user.' },
        });
      }

      const detailedWallet = await CreditService.getDetailedWallet(prof.id);

      return res.status(200).json({
        success: true,
        data: detailedWallet,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to retrieve credit wallet' },
      });
    }
  }

  /**
   * POST /api/v1/credits/calculate-fee
   * Calculates required application credits for a given budget (Section 10-12)
   */
  static async calculateFee(req: Request, res: Response) {
    try {
      const { budgetMin, budgetMax, budget } = req.body;
      const minVal = budgetMin !== undefined ? Number(budgetMin) : Number(budget);
      const maxVal = budgetMax !== undefined ? Number(budgetMax) : minVal;

      if (!minVal || isNaN(minVal) || minVal <= 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Valid minimum budget is required (positive number).' },
        });
      }

      const credits = await CreditService.calculateFee(minVal, maxVal);

      return res.status(200).json({
        success: true,
        data: {
          budgetMin: minVal,
          budgetMax: maxVal,
          creditsRequired: credits,
          nominalCostInr: credits * 10, // 1 Credit = ₹10
          currency: 'INR (₹)',
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to calculate application fee' },
      });
    }
  }

  /**
   * GET /api/v1/credits/plans
   * List 5 Vaziro Professional Plans (Section 13)
   */
  static async getPlans(req: Request, res: Response) {
    try {
      let plans = await prisma.professionalPlan.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      });

      if (!plans || plans.length === 0) {
        // Fallback to legacy CreditPlan
        const legacyPlans = await prisma.creditPlan.findMany({
          where: { isActive: true },
          orderBy: { price: 'asc' },
        });

        plans = legacyPlans.map((p, idx) => ({
          id: p.id,
          name: p.name,
          slug: p.name.toLowerCase(),
          price: p.price,
          baseCredits: p.creditsCount,
          bonusCredits: 0,
          totalCredits: p.creditsCount,
          visibilityTier: 'STANDARD',
          description: p.perks,
          isPopular: p.isRecommended,
          isActive: true,
          displayOrder: idx + 1,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
      }

      return res.status(200).json({
        success: true,
        data: plans,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch professional plans' },
      });
    }
  }

  /**
   * POST /api/v1/credits/create-order
   * Generate Razorpay order for professional plan purchase (Section 39, 44, 70)
   */
  static async createOrder(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({
          success: false,
          error: { message: 'Plan ID is required.' },
        });
      }

      // Fetch authoritative plan from DB (Never trust frontend price)
      let plan = await prisma.professionalPlan.findFirst({
        where: {
          OR: [{ id: planId }, { slug: planId }, { name: planId }],
          isActive: true,
        },
      });

      if (!plan) {
        const legacyPlan = await prisma.creditPlan.findFirst({
          where: {
            OR: [{ id: planId }, { name: planId }],
            isActive: true,
          },
        });
        if (!legacyPlan) {
          return res.status(404).json({
            success: false,
            error: { message: 'Professional plan not found or inactive.' },
          });
        }
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

      const prof = await prisma.professionalProfile.findUnique({
        where: { userId },
      });

      if (!prof) {
        return res.status(404).json({
          success: false,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Professional profile not found.' },
        });
      }

      const receipt = `plan_${prof.id.substring(0, 8)}_${Date.now()}`;
      const razorpayOrder = await RazorpayService.createOrder(plan.price, receipt, {
        planId: plan.id,
        professionalProfileId: prof.id,
        userId: userId || '',
        type: 'PROFESSIONAL_PLAN',
      });

      // Pre-record pending Payment record
      await prisma.payment.create({
        data: {
          userId,
          orderId: receipt,
          razorpayOrderId: razorpayOrder.id,
          amount: plan.price,
          currency: 'INR',
          status: 'CREATED',
          paymentPurpose: 'PROFESSIONAL_PLAN',
          description: `Vaziro Professional Plan: ${plan.name} (₹${plan.price})`,
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Professional plan purchase order created successfully.',
        data: {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount, // in paise
          amountInr: plan.price,
          currency: razorpayOrder.currency,
          keyId: RazorpayService.getKeyId(),
          plan: {
            id: plan.id,
            name: plan.name,
            price: plan.price,
            baseCredits: plan.baseCredits,
            bonusCredits: plan.bonusCredits,
            totalCredits: plan.totalCredits,
            visibilityTier: plan.visibilityTier,
          },
          user: {
            name: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(),
            email: req.user?.email || '',
            phone: req.user?.phone || '',
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create professional plan order' },
      });
    }
  }

  /**
   * POST /api/v1/credits/verify-payment
   * Cryptographically verify signature and fulfill plan purchase (Section 40, 44)
   */
  static async verifyPayment(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { orderId, paymentId, signature, planId } = req.body;

      if (!orderId || !paymentId || !planId) {
        return res.status(400).json({
          success: false,
          error: { message: 'orderId, paymentId, and planId are required.' },
        });
      }

      // Cryptographic verification server-side
      const isValid = RazorpayService.verifyPaymentSignature(orderId, paymentId, signature);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_SIGNATURE', message: 'Cryptographic payment verification failed.' },
        });
      }

      const prof = await prisma.professionalProfile.findUnique({
        where: { userId },
      });

      if (!prof) {
        return res.status(404).json({
          success: false,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Professional profile not found.' },
        });
      }

      // Update payment status to CAPTURED
      await prisma.payment.updateMany({
        where: { razorpayOrderId: orderId },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId: paymentId,
          capturedAt: new Date(),
        },
      });

      const result = await CreditService.fulfillPlanPurchase(prof.id, planId, {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
      });

      return res.status(200).json({
        success: true,
        message: 'Payment verified! Professional plan and credits activated successfully.',
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to verify payment' },
      });
    }
  }

  /**
   * GET /api/v1/credits/batches
   * View all credit batches (active, expiring, refunded) (Section 18, 117)
   */
  static async getBatches(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const prof = await prisma.professionalProfile.findUnique({
        where: { userId },
      });

      if (!prof) {
        return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
      }

      const batches = await prisma.creditBatch.findMany({
        where: { professionalProfileId: prof.id },
        include: { planPurchase: { include: { plan: true } } },
        orderBy: { grantedAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: batches,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch credit batches' },
      });
    }
  }

  /**
   * GET /api/v1/credits/ledger
   * View immutable credit audit ledger (Section 20, 117)
   */
  static async getLedger(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const prof = await prisma.professionalProfile.findUnique({
        where: { userId },
      });

      if (!prof) {
        return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
      }

      const ledger = await prisma.creditLedger.findMany({
        where: { professionalProfileId: prof.id },
        include: { batch: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return res.status(200).json({
        success: true,
        data: ledger,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch credit ledger' },
      });
    }
  }

  // Alias for backward compatibility
  static async purchasePlan(req: Request, res: Response) {
    return await CreditsController.verifyPayment(req, res);
  }
}

