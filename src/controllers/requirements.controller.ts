import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { CreditService } from '../services/credit.service';

export class RequirementsController {
  /**
   * POST /api/v1/requirements
   */
  static async createRequirement(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const {
        categoryId,
        subcategoryId,
        title,
        description,
        budgetType, // FIXED or RANGE
        minimumBudget,
        maximumBudget,
        budgetMin,
        budgetMax,
        stateId,
        cityId,
        areaId,
        pincode,
        pincodeId,
        preferredDate,
        preferredTime,
        timeline,
        frequency,
        experienceRequirement,
        genderPreference,
        specialInstructions,
      } = req.body;

      const effectiveMin = budgetMin !== undefined ? Number(budgetMin) : Number(minimumBudget);
      const effectiveMax = budgetMax !== undefined ? Number(budgetMax) : (maximumBudget !== undefined ? Number(maximumBudget) : effectiveMin);
      const effectivePincodeId = pincodeId || pincode;

      if (!categoryId || !subcategoryId || !title || !description || !effectiveMin) {
        return res.status(400).json({
          success: false,
          error: { message: 'Missing required fields: categoryId, subcategoryId, title, description, and budget are mandatory.' },
        });
      }

      if (budgetType === 'RANGE' && effectiveMax < effectiveMin) {
        return res.status(400).json({
          success: false,
          error: { message: 'For budget range, maximum budget must be greater than or equal to minimum budget.' },
        });
      }

      // 1. Resolve Category
      let validCategoryId = categoryId;
      const existingCat = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!existingCat) {
        const cleanCat = String(categoryId).replace(/^cat-/, '').toLowerCase();
        const foundCat = await prisma.category.findFirst({
          where: {
            OR: [
              { slug: cleanCat },
              { name: { contains: cleanCat } },
            ],
          },
        });
        if (foundCat) {
          validCategoryId = foundCat.id;
        } else {
          const firstCat = await prisma.category.findFirst({ where: { isActive: true } });
          if (firstCat) validCategoryId = firstCat.id;
        }
      }

      // 2. Resolve Subcategory
      let validSubcategoryId = subcategoryId;
      const existingSub = await prisma.subcategory.findUnique({ where: { id: subcategoryId } });
      if (!existingSub) {
        const cleanSub = String(subcategoryId).replace(/^sub-/, '').toLowerCase();
        const foundSub = await prisma.subcategory.findFirst({
          where: {
            categoryId: validCategoryId,
            OR: [
              { slug: cleanSub },
              { name: { contains: cleanSub } },
            ],
          },
        });
        if (foundSub) {
          validSubcategoryId = foundSub.id;
        } else {
          const firstSub = await prisma.subcategory.findFirst({
            where: { categoryId: validCategoryId, isActive: true },
          });
          if (firstSub) validSubcategoryId = firstSub.id;
        }
      }

      // 3. Resolve City
      let validCityId: string | null = null;
      if (cityId) {
        const existingCity = await prisma.city.findUnique({ where: { id: cityId } });
        if (existingCity) {
          validCityId = existingCity.id;
        } else {
          const cleanCity = String(cityId).replace(/^city-/, '').toLowerCase();
          const foundCity = await prisma.city.findFirst({
            where: {
              OR: [
                { slug: cleanCity },
                { name: { contains: cleanCity } },
              ],
            },
          });
          if (foundCity) {
            validCityId = foundCity.id;
          }
        }
      }

      if (!validCityId) {
        const defaultCity = await prisma.city.findFirst({
          where: {
            OR: [
              { slug: 'delhi' },
              { name: 'Delhi' },
              { slug: 'new-delhi' },
            ],
          },
        });
        validCityId = defaultCity ? defaultCity.id : null;
      }

      // 4. Resolve State
      let validStateId: string | null = null;
      if (stateId) {
        const existingState = await prisma.state.findUnique({ where: { id: stateId } });
        if (existingState) validStateId = existingState.id;
      }
      if (!validStateId && validCityId) {
        const cityWithState = await prisma.city.findUnique({
          where: { id: validCityId },
          select: { stateId: true },
        });
        if (cityWithState) validStateId = cityWithState.stateId;
      }

      // 5. Resolve Pincode
      let validPincodeId: string | null = null;
      if (effectivePincodeId) {
        const pinRecord = await prisma.pincode.findFirst({
          where: { pincode: String(effectivePincodeId) },
        });
        validPincodeId = pinRecord ? pinRecord.id : null;
      }

      // 6. Create or update CustomerProfile with validated foreign keys
      let customerProfile = await prisma.customerProfile.findUnique({
        where: { userId },
      });

      if (!customerProfile) {
        customerProfile = await prisma.customerProfile.create({
          data: {
            userId,
            cityId: validCityId,
            pincodeId: validPincodeId,
          },
        });
      }

      const requirement = await prisma.requirement.create({
        data: {
          customerId: customerProfile.id,
          categoryId: validCategoryId,
          subcategoryId: validSubcategoryId,
          title,
          description,
          budgetType: budgetType || 'FIXED',
          budgetMin: effectiveMin,
          budgetMax: effectiveMax,
          currency: 'INR',
          stateId: validStateId,
          cityId: validCityId,
          areaId: null,
          pincodeId: validPincodeId,
          preferredDate: preferredDate ? new Date(preferredDate) : null,
          preferredTime: preferredTime || null,
          timeline: timeline || 'ASAP',
          frequency: frequency || 'ONE_TIME',
          experienceRequirement: experienceRequirement || null,
          genderPreference: genderPreference || 'NO_PREFERENCE',
          specialInstructions: specialInstructions || null,
          status: 'RECEIVING_QUOTES',
        },
        include: {
          category: true,
          subcategory: true,
          city: true,
        },
      });

      await prisma.customerProfile.update({
        where: { id: customerProfile.id },
        data: { jobsPostedCount: { increment: 1 } },
      });

      const creditCost = await CreditService.calculateFee(requirement.budgetMin, requirement.budgetMax);

      return res.status(201).json({
        success: true,
        message: 'Requirement posted successfully. Service professionals in your area are being notified.',
        data: {
          ...requirement,
          creditCost,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to post requirement' },
      });
    }
  }

  /**
   * GET /api/v1/requirements
   */
  static async listRequirements(req: Request, res: Response) {
    try {
      const { categoryId, subcategoryId, cityId, pincode, status } = req.query;

      const whereClause: any = {};

      if (categoryId) whereClause.categoryId = String(categoryId);
      if (subcategoryId) whereClause.subcategoryId = String(subcategoryId);
      if (cityId) whereClause.cityId = String(cityId);
      if (status) {
        whereClause.status = String(status);
      } else {
        whereClause.status = { in: ['PUBLISHED', 'RECEIVING_QUOTES'] };
      }

      const requirements = await prisma.requirement.findMany({
        where: whereClause,
        include: {
          category: true,
          subcategory: true,
          city: true,
          customer: {
            include: {
              user: {
                select: { firstName: true, createdAt: true },
              },
            },
          },
          _count: {
            select: {
              applications: true,
              quotations: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const enriched = await Promise.all(
        requirements.map(async (item) => {
          const creditsRequired = await CreditService.calculateFee(item.budgetMin, item.budgetMax);
          return {
            ...item,
            minimumBudget: item.budgetMin,
            maximumBudget: item.budgetMax,
            creditsRequired,
            customerTrust: {
              firstName: item.customer.user.firstName,
              jobsPostedCount: item.customer.jobsPostedCount,
              jobsCompletedCount: item.customer.jobsCompletedCount,
              memberSince: item.customer.user.createdAt,
              trustScore: item.customer.trustScore,
            },
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: enriched,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to retrieve requirements' },
      });
    }
  }

  /**
   * GET /api/v1/requirements/my
   */
  static async getMyRequirements(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const customer = await prisma.customerProfile.findUnique({
        where: { userId },
      });

      if (!customer) {
        return res.status(200).json({ success: true, data: [] });
      }

      const requirements = await prisma.requirement.findMany({
        where: { customerId: customer.id },
        include: {
          category: true,
          subcategory: true,
          city: true,
          _count: {
            select: { quotations: true, applications: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: requirements.map((r) => ({
          ...r,
          minimumBudget: r.budgetMin,
          maximumBudget: r.budgetMax,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch customer requirements' },
      });
    }
  }

  /**
   * GET /api/v1/requirements/:id
   */
  static async getRequirementById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const requirement = await prisma.requirement.findUnique({
        where: { id },
        include: {
          category: true,
          subcategory: true,
          city: true,
          customer: {
            include: {
              user: {
                select: { firstName: true, createdAt: true },
              },
            },
          },
          _count: {
            select: { applications: true, quotations: true },
          },
        },
      });

      if (!requirement) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Requirement not found' },
        });
      }

      const creditsRequired = await CreditService.calculateFee(requirement.budgetMin, requirement.budgetMax);

      return res.status(200).json({
        success: true,
        data: {
          ...requirement,
          minimumBudget: requirement.budgetMin,
          maximumBudget: requirement.budgetMax,
          creditsRequired,
          customerTrust: {
            firstName: requirement.customer.user.firstName,
            jobsPostedCount: requirement.customer.jobsPostedCount,
            jobsCompletedCount: requirement.customer.jobsCompletedCount,
            memberSince: requirement.customer.user.createdAt,
            trustScore: requirement.customer.trustScore,
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch requirement detail' },
      });
    }
  }

  /**
   * PATCH /api/v1/requirements/:id/status
   */
  static async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user?.id;

      const allowedStatuses = ['CANCELLED', 'CLOSED'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid status update. Allowed: ${allowedStatuses.join(', ')}` },
        });
      }

      const requirement = await prisma.requirement.findUnique({
        where: { id },
        include: { customer: true },
      });

      if (!requirement) {
        return res.status(404).json({ success: false, error: { message: 'Requirement not found' } });
      }

      if (requirement.customer.userId !== userId && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
      }

      const updated = await prisma.requirement.update({
        where: { id },
        data: { status },
      });

      return res.status(200).json({
        success: true,
        message: `Requirement status updated to ${status}`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update requirement status' },
      });
    }
  }
}
