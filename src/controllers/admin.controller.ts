import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export class AdminController {
  /**
   * GET /api/v1/admin/metrics
   */
  static async getMetrics(req: Request, res: Response) {
    try {
      const [
        totalUsers,
        totalCustomers,
        totalProfessionals,
        verifiedProfessionals,
        totalRequirements,
        activeJobs,
        completedJobs,
        totalCreditsSpent,
        totalPayments,
        openDisputes,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.customerProfile.count(),
        prisma.professionalProfile.count(),
        prisma.professionalProfile.count({ where: { isVerified: true } }),
        prisma.requirement.count(),
        prisma.job.count({ where: { status: { in: ['HIRED', 'SCHEDULED', 'PREPARING', 'ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED'] } } }),
        prisma.job.count({ where: { status: { in: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'PAYMENT_RELEASED', 'CLOSED'] } } }),
        prisma.creditTransaction.aggregate({
          where: { transactionType: 'APPLICATION_DEBIT' },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: { status: { in: ['SECURED', 'COMPLETED'] } },
          _sum: { amount: true },
        }),
        prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
      ]);

      const totalCreditsDeducted = Math.abs(totalCreditsSpent._sum?.amount || 0);
      const totalGmvInr = totalPayments._sum?.amount || 0;

      return res.status(200).json({
        success: true,
        data: {
          users: {
            total: totalUsers,
            customers: totalCustomers,
            professionals: totalProfessionals,
            verifiedProfessionals,
          },
          marketplace: {
            totalRequirements,
            activeJobs,
            completedJobs,
            openDisputes,
          },
          financials: {
            totalCreditsDeducted,
            totalGmvInr,
            currency: 'INR (₹)',
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch admin metrics' },
      });
    }
  }

  /**
   * GET /api/v1/admin/users
   */
  static async getUsers(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({
        include: {
          roles: { include: { role: true } },
          customerProfile: true,
          professionalProfile: {
            include: { verification: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch users' },
      });
    }
  }

  /**
   * PATCH /api/v1/admin/users/:id/status
   */
  static async updateUserStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updated = await prisma.user.update({
        where: { id },
        data: { status },
      });

      return res.status(200).json({
        success: true,
        message: `User status updated to ${status}`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update user status' },
      });
    }
  }

  /**
   * GET /api/v1/admin/verifications
   */
  static async getVerifications(req: Request, res: Response) {
    try {
      const verifications = await prisma.verification.findMany({
        include: {
          professional: {
            include: {
              user: {
                select: { firstName: true, lastName: true, phone: true, email: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: verifications,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch verification queue' },
      });
    }
  }

  /**
   * PATCH /api/v1/admin/verifications/:id
   */
  static async reviewVerification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, rejectionReason } = req.body;

      const verification = await prisma.verification.findUnique({
        where: { id },
      });

      if (!verification) {
        return res.status(404).json({ success: false, error: { message: 'Verification not found' } });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const v = await tx.verification.update({
          where: { id },
          data: {
            status,
            rejectionReason: rejectionReason || null,
            verifiedAt: status === 'VERIFIED' ? new Date() : null,
          },
        });

        await tx.professionalProfile.update({
          where: { id: verification.professionalProfileId },
          data: { isVerified: status === 'VERIFIED' },
        });

        return v;
      });

      return res.status(200).json({
        success: true,
        message: `Verification marked as ${status}`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to review verification' },
      });
    }
  }

  /**
   * GET /api/v1/admin/settings
   */
  static async getSettings(req: Request, res: Response) {
    try {
      const settings = await prisma.systemSetting.findMany({
        orderBy: { key: 'asc' },
      });

      return res.status(200).json({
        success: true,
        data: settings,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch settings' },
      });
    }
  }

  /**
   * PUT /api/v1/admin/settings
   */
  static async updateSetting(req: Request, res: Response) {
    try {
      const { key, value } = req.body;
      const adminId = req.user?.id;

      if (!key || value === undefined) {
        return res.status(400).json({ success: false, error: { message: 'key and value are required.' } });
      }

      const updated = await prisma.systemSetting.upsert({
        where: { key },
        update: {
          value: String(value),
          updatedByUserId: adminId,
        },
        create: {
          key,
          value: String(value),
          updatedByUserId: adminId,
        },
      });

      return res.status(200).json({
        success: true,
        message: `Setting ${key} updated to ${value}`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update system setting' },
      });
    }
  }

  /**
   * GET /api/v1/admin/locations
   */
  static async getAllLocations(req: Request, res: Response) {
    try {
      const states = await prisma.state.findMany({
        orderBy: { name: 'asc' },
        include: {
          cities: {
            orderBy: { name: 'asc' },
          },
        },
      });

      return res.status(200).json({
        success: true,
        data: states,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch admin locations' },
      });
    }
  }

  /**
   * PATCH /api/v1/admin/locations/toggle
   */
  static async toggleLocation(req: Request, res: Response) {
    try {
      const { type, id, isActive } = req.body;

      if (!type || !id || isActive === undefined) {
        return res.status(400).json({ success: false, error: { message: 'type (state|city|area|pincode), id, and isActive are required.' } });
      }

      let result;
      if (type === 'state') {
        result = await prisma.state.update({ where: { id }, data: { isActive } });
      } else if (type === 'city') {
        result = await prisma.city.update({ where: { id }, data: { isActive } });
      } else if (type === 'area') {
        result = await prisma.area.update({ where: { id }, data: { isActive } });
      } else if (type === 'pincode') {
        result = await prisma.pincode.update({ where: { id }, data: { isActive } });
      } else {
        return res.status(400).json({ success: false, error: { message: 'Invalid location type' } });
      }

      return res.status(200).json({
        success: true,
        message: `${type} status set to ${isActive ? 'ACTIVE' : 'INACTIVE'}`,
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to toggle location' },
      });
    }
  }
}
