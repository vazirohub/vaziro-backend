import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { CreditService } from '../services/credit.service';

export class CreditsController {
  /**
   * GET /api/v1/credits/wallet
   * Returns current professional wallet and transaction ledger
   */
  static async getWallet(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      // Find professional profile for user
      const prof = await prisma.professionalProfile.findUnique({
        where: { userId },
      });

      if (!prof) {
        return res.status(404).json({
          success: false,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Professional profile not found for this user.' },
        });
      }

      const wallet = await CreditService.getOrCreateWallet(prof.id);

      return res.status(200).json({
        success: true,
        data: wallet,
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
   * Calculates required application credits for a given budget
   */
  static async calculateFee(req: Request, res: Response) {
    try {
      const { budgetMin, budgetMax } = req.body;
      if (!budgetMin || typeof budgetMin !== 'number' || budgetMin <= 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Valid minimum budget is required (positive number).' },
        });
      }

      const credits = await CreditService.calculateFee(budgetMin, budgetMax);

      return res.status(200).json({
        success: true,
        data: {
          budgetMin,
          budgetMax: budgetMax || budgetMin,
          creditsRequired: credits,
          nominalCostInr: credits * 50,
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
   * List available credit plans
   */
  static async getPlans(req: Request, res: Response) {
    try {
      const plans = await prisma.creditPlan.findMany({
        where: { isActive: true },
        orderBy: { price: 'asc' },
      });

      return res.status(200).json({
        success: true,
        data: plans,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch credit plans' },
      });
    }
  }

  /**
   * POST /api/v1/credits/purchase
   * Purchase a credit bundle
   */
  static async purchasePlan(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({
          success: false,
          error: { message: 'Plan ID is required.' },
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

      const result = await CreditService.purchasePlan(prof.id, planId);

      return res.status(200).json({
        success: true,
        message: 'Credit plan purchased successfully.',
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to complete credit plan purchase' },
      });
    }
  }
}
