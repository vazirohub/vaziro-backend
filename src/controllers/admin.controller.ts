import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { CreditService } from '../services/credit.service';

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
            include: {
              verification: true,
              creditWallet: {
                include: {
                  transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const sanitized = users.map((u) => {
        const { passwordHash, ...rest } = u;
        return rest;
      });

      return res.status(200).json({
        success: true,
        data: sanitized,
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
   * POST /api/v1/admin/users/:id/credits
   * Adjust or allot credits to a user
   */
  static async adjustUserCredits(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { amount, mode, notes } = req.body; // mode: 'ADD' | 'DEDUCT' | 'SET'

      if (amount === undefined || isNaN(Number(amount))) {
        return res.status(400).json({ success: false, error: { message: 'Valid numerical amount is required.' } });
      }

      const numAmount = Math.round(Number(amount));
      const validMode = ['ADD', 'DEDUCT', 'SET'].includes(mode) ? mode : 'ADD';

      const user = await prisma.user.findUnique({
        where: { id },
        include: { professionalProfile: { include: { creditWallet: true } } },
      });

      if (!user) {
        return res.status(404).json({ success: false, error: { message: 'User not found.' } });
      }

      // Ensure user has a professional profile
      let prof = user.professionalProfile;
      if (!prof) {
        prof = await prisma.professionalProfile.create({
          data: {
            userId: user.id,
            title: 'Service Professional',
            isVerified: true,
          },
          include: { creditWallet: true },
        });
      }

      // Ensure professional profile has a credit wallet
      let wallet = prof.creditWallet;
      if (!wallet) {
        wallet = await prisma.creditWallet.create({
          data: {
            professionalProfileId: prof.id,
            balance: 0,
            lifetimePurchased: 0,
            lifetimeSpent: 0,
          },
        });
      }

      let newBalance = wallet.balance;
      if (validMode === 'ADD') {
        newBalance = wallet.balance + Math.abs(numAmount);
      } else if (validMode === 'DEDUCT') {
        newBalance = Math.max(0, wallet.balance - Math.abs(numAmount));
      } else if (validMode === 'SET') {
        newBalance = Math.max(0, numAmount);
      }

      const diff = newBalance - wallet.balance;

      const updated = await prisma.$transaction(async (tx) => {
        const updatedWallet = await tx.creditWallet.update({
          where: { id: wallet!.id },
          data: {
            balance: newBalance,
            lifetimePurchased: diff > 0 ? wallet!.lifetimePurchased + diff : wallet!.lifetimePurchased,
          },
        });

        const txRecord = await tx.creditTransaction.create({
          data: {
            creditWalletId: wallet!.id,
            amount: diff,
            balanceAfter: newBalance,
            transactionType: 'ADMIN_ADJUSTMENT',
            notes: notes || `Admin Credit Adjustment (${validMode}: ${numAmount})`,
          },
        });

        return { wallet: updatedWallet, transaction: txRecord };
      });

      return res.status(200).json({
        success: true,
        message: `Credits successfully adjusted. New balance: ${newBalance} credits.`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to adjust credits' },
      });
    }
  }

  /**
   * PUT /api/v1/admin/users/:id
   * Edit user details, roles, and verification status
   */
  static async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { firstName, lastName, email, phone, status, roles, isVerified } = req.body;

      const existing = await prisma.user.findUnique({
        where: { id },
        include: { professionalProfile: true },
      });

      if (!existing) {
        return res.status(404).json({ success: false, error: { message: 'User not found.' } });
      }

      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName.trim();
      if (lastName !== undefined) updateData.lastName = lastName.trim();
      if (email !== undefined) updateData.email = email.trim().toLowerCase();
      if (phone !== undefined) updateData.phone = phone.trim();
      if (status !== undefined) updateData.status = status;

      await prisma.user.update({
        where: { id },
        data: updateData,
      });

      if (Array.isArray(roles) && roles.length > 0) {
        const matchedRoles = await prisma.role.findMany({
          where: { name: { in: roles } },
        });

        if (matchedRoles.length > 0) {
          await prisma.userRole.deleteMany({
            where: { userId: id },
          });

          await prisma.userRole.createMany({
            data: matchedRoles.map((r) => ({
              userId: id,
              roleId: r.id,
            })),
          });
        }
      }

      if (isVerified !== undefined) {
        let prof = existing.professionalProfile;
        if (!prof) {
          prof = await prisma.professionalProfile.create({
            data: {
              userId: id,
              title: 'Service Professional',
              isVerified: Boolean(isVerified),
            },
          });
        } else {
          await prisma.professionalProfile.update({
            where: { id: prof.id },
            data: { isVerified: Boolean(isVerified) },
          });
        }

        await prisma.verification.upsert({
          where: { professionalProfileId: prof.id },
          update: {
            status: isVerified ? 'VERIFIED' : 'FAILED',
            verifiedAt: isVerified ? new Date() : null,
          },
          create: {
            professionalProfileId: prof.id,
            status: isVerified ? 'VERIFIED' : 'FAILED',
            provider: 'MANUAL',
            verifiedAt: isVerified ? new Date() : null,
          },
        });
      }

      const finalUser = await prisma.user.findUnique({
        where: { id },
        include: {
          roles: { include: { role: true } },
          customerProfile: true,
          professionalProfile: {
            include: {
              verification: true,
              creditWallet: {
                include: {
                  transactions: { orderBy: { createdAt: 'desc' }, take: 5 },
                },
              },
            },
          },
        },
      });

      const { passwordHash, ...rest } = finalUser as any;

      return res.status(200).json({
        success: true,
        message: 'User details updated successfully.',
        data: rest,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update user' },
      });
    }
  }

  /**
   * POST /api/v1/admin/users/:id/reset-password
   * Force reset a user password
   */
  static async resetUserPassword(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: { message: 'Password must be at least 6 characters long.' },
        });
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ success: false, error: { message: 'User not found.' } });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });

      return res.status(200).json({
        success: true,
        message: `Password for ${user.firstName} ${user.lastName} has been reset successfully.`,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to reset password' },
      });
    }
  }

  /**
   * DELETE /api/v1/admin/users/:id
   * Delete user account
   */
  static async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const adminId = req.user?.id;

      if (id === adminId) {
        return res.status(400).json({
          success: false,
          error: { message: 'You cannot delete your own admin account.' },
        });
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ success: false, error: { message: 'User not found.' } });
      }

      await prisma.user.delete({ where: { id } });

      return res.status(200).json({
        success: true,
        message: `User ${user.firstName} ${user.lastName} deleted successfully.`,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to delete user' },
      });
    }
  }

  /**
   * GET /api/v1/admin/verifications
   * Supports status filtering and multi-field search
   */
  static async getVerifications(req: Request, res: Response) {
    try {
      const { status, search } = req.query;

      const whereClause: any = {};

      if (status && typeof status === 'string' && status !== 'ALL') {
        whereClause.status = status.toUpperCase();
      }

      if (search && typeof search === 'string' && search.trim()) {
        const query = search.trim();
        whereClause.OR = [
          { referenceId: { contains: query } },
          { requestId: { contains: query } },
          { verificationReference: { contains: query } },
          {
            professional: {
              OR: [
                { id: { contains: query } },
                {
                  user: {
                    OR: [
                      { firstName: { contains: query } },
                      { lastName: { contains: query } },
                      { phone: { contains: query } },
                      { email: { contains: query } },
                    ],
                  },
                },
              ],
            },
          },
        ];
      }

      const verifications = await prisma.verification.findMany({
        where: whereClause,
        include: {
          professional: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, phone: true, email: true },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
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
   * GET /api/v1/admin/verifications/:id
   */
  static async getVerificationById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const verification = await prisma.verification.findUnique({
        where: { id },
        include: {
          professional: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, phone: true, email: true, createdAt: true },
              },
            },
          },
        },
      });

      if (!verification) {
        return res.status(404).json({ success: false, error: { message: 'Verification case not found.' } });
      }

      // Fetch audit logs for this verification case
      const auditLogs = await prisma.auditLog.findMany({
        where: { entityId: verification.professionalProfileId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      return res.status(200).json({
        success: true,
        data: {
          ...verification,
          auditLogs,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch verification details' },
      });
    }
  }

  /**
   * POST /api/v1/admin/verifications/:id/review
   * Mark a verification case for manual review
   */
  static async markForReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reviewReason } = req.body;
      const adminId = req.user?.id;

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
            status: 'REVIEW_REQUIRED',
            reviewReason: reviewReason || 'Flagged for manual compliance review by Administrator.',
          },
        });

        await tx.professionalProfile.update({
          where: { id: verification.professionalProfileId },
          data: { isVerified: false },
        });

        await tx.auditLog.create({
          data: {
            userId: adminId,
            action: 'ADMIN_VERIFICATION_REVIEW',
            entityType: 'Verification',
            entityId: verification.professionalProfileId,
            metadata: JSON.stringify({
              adminId,
              previousStatus: verification.status,
              reviewReason: reviewReason || 'Manual compliance review initiated',
              timestamp: new Date().toISOString(),
            }),
          },
        });

        return v;
      });

      return res.status(200).json({
        success: true,
        message: 'Verification case marked for manual review.',
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update review status' },
      });
    }
  }

  /**
   * POST /api/v1/admin/verifications/:id/override
   * Explicit administrative override with mandatory reason and immutable audit trail
   */
  static async adminOverride(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { action, reason } = req.body; // action: 'APPROVE' | 'REJECT'
      const adminId = req.user?.id;

      if (!action || !['APPROVE', 'REJECT'].includes(action)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Action must be either APPROVE or REJECT.' },
        });
      }

      if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
        return res.status(400).json({
          success: false,
          error: { message: 'A specific explanation (reason) is strictly mandatory for administrative overrides.' },
        });
      }

      const verification = await prisma.verification.findUnique({
        where: { id },
      });

      if (!verification) {
        return res.status(404).json({ success: false, error: { message: 'Verification case not found.' } });
      }

      const targetStatus = action === 'APPROVE' ? 'VERIFIED' : 'FAILED';
      const isVerified = action === 'APPROVE';

      const updated = await prisma.$transaction(async (tx) => {
        const v = await tx.verification.update({
          where: { id },
          data: {
            status: targetStatus,
            verifiedAt: isVerified ? new Date() : null,
            failureReason: isVerified ? null : reason.trim(),
            reviewReason: `Admin Override (${action}): ${reason.trim()}`,
          },
        });

        await tx.professionalProfile.update({
          where: { id: verification.professionalProfileId },
          data: { isVerified },
        });

        await tx.auditLog.create({
          data: {
            userId: adminId,
            action: 'ADMIN_VERIFICATION_OVERRIDE',
            entityType: 'Verification',
            entityId: verification.professionalProfileId,
            metadata: JSON.stringify({
              adminId,
              overrideAction: action,
              reason: reason.trim(),
              previousStatus: verification.status,
              newStatus: targetStatus,
              timestamp: new Date().toISOString(),
            }),
          },
        });

        return v;
      });

      return res.status(200).json({
        success: true,
        message: `Administrative override successful: Verification marked as ${targetStatus}.`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to process administrative override' },
      });
    }
  }

  /**
   * PATCH /api/v1/admin/verifications/:id (Legacy wrapper)
   */
  static async reviewVerification(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, rejectionReason } = req.body;

      if (status === 'VERIFIED') {
        req.body.action = 'APPROVE';
        req.body.reason = rejectionReason || 'KYC credentials verified by administrator';
        return AdminController.adminOverride(req, res);
      } else if (status === 'FAILED') {
        req.body.action = 'REJECT';
        req.body.reason = rejectionReason || 'KYC credentials rejected by administrator';
        return AdminController.adminOverride(req, res);
      } else if (status === 'REVIEW_REQUIRED') {
        req.body.reviewReason = rejectionReason;
        return AdminController.markForReview(req, res);
      }

      return res.status(400).json({ success: false, error: { message: 'Invalid verification status' } });
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

  /**
   * GET /api/v1/admin/requirements
   */
  static async getRequirements(req: Request, res: Response) {
    try {
      const requirements = await prisma.requirement.findMany({
        include: {
          category: true,
          subcategory: true,
          city: true,
          customer: {
            include: {
              user: { select: { firstName: true, lastName: true, phone: true, email: true } },
            },
          },
          _count: {
            select: { applications: true, quotations: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return res.status(200).json({
        success: true,
        data: requirements,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch requirements' },
      });
    }
  }

  /**
   * PATCH /api/v1/admin/requirements/:id/status
   */
  static async updateRequirementStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const reqRecord = await prisma.requirement.update({
        where: { id },
        data: { status },
      });

      return res.status(200).json({
        success: true,
        message: `Requirement status updated to ${status}`,
        data: reqRecord,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update requirement status' },
      });
    }
  }

  /**
   * GET /api/v1/admin/jobs
   */
  static async getJobs(req: Request, res: Response) {
    try {
      const jobs = await prisma.job.findMany({
        include: {
          requirement: { select: { title: true, categoryId: true } },
          customer: {
            include: {
              user: { select: { firstName: true, lastName: true, phone: true, email: true } },
            },
          },
          professional: {
            include: {
              user: { select: { firstName: true, lastName: true, phone: true, email: true } },
            },
          },
          paymentProtection: true,
          payments: true,
          review: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return res.status(200).json({
        success: true,
        data: jobs,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch jobs' },
      });
    }
  }

  /**
   * PATCH /api/v1/admin/jobs/:id/status
   */
  static async updateJobStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      const job = await prisma.job.update({
        where: { id },
        data: { status },
      });

      await prisma.jobStatusHistory.create({
        data: {
          jobId: id,
          newStatus: status,
          reason: reason || 'Admin manual status override',
        },
      });

      return res.status(200).json({
        success: true,
        message: `Job status updated to ${status}`,
        data: job,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update job status' },
      });
    }
  }

  // ==========================================
  // Categories & Subcategories Governance
  // ==========================================

  static async createCategory(req: Request, res: Response) {
    try {
      const { name, slug, icon, description } = req.body;
      if (!name || !slug) {
        return res.status(400).json({ success: false, error: { message: 'Name and slug are required.' } });
      }

      const category = await prisma.category.create({
        data: {
          name,
          slug: slug.toLowerCase().trim(),
          icon: icon || 'Briefcase',
          description: description || null,
          isActive: true,
        },
      });

      return res.status(201).json({ success: true, message: 'Category created successfully.', data: category });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to create category' } });
    }
  }

  static async updateCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, slug, icon, description, isActive } = req.body;

      const category = await prisma.category.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(slug && { slug: slug.toLowerCase().trim() }),
          ...(icon && { icon }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });

      return res.status(200).json({ success: true, message: 'Category updated successfully.', data: category });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update category' } });
    }
  }

  static async deleteCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      // Soft disable category to maintain relational integrity
      const category = await prisma.category.update({
        where: { id },
        data: { isActive: false },
      });

      return res.status(200).json({ success: true, message: 'Category disabled successfully.', data: category });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to disable category' } });
    }
  }

  static async createSubcategory(req: Request, res: Response) {
    try {
      const { categoryId, name, slug, description } = req.body;
      if (!categoryId || !name || !slug) {
        return res.status(400).json({ success: false, error: { message: 'categoryId, name, and slug are required.' } });
      }

      const subcategory = await prisma.subcategory.create({
        data: {
          categoryId,
          name,
          slug: slug.toLowerCase().trim(),
          description: description || null,
          isActive: true,
        },
      });

      return res.status(201).json({ success: true, message: 'Subcategory created successfully.', data: subcategory });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to create subcategory' } });
    }
  }

  static async updateSubcategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, slug, description, isActive, categoryId } = req.body;

      const subcategory = await prisma.subcategory.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(slug && { slug: slug.toLowerCase().trim() }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
          ...(categoryId && { categoryId }),
        },
      });

      return res.status(200).json({ success: true, message: 'Subcategory updated successfully.', data: subcategory });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update subcategory' } });
    }
  }

  static async deleteSubcategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const subcategory = await prisma.subcategory.update({
        where: { id },
        data: { isActive: false },
      });

      return res.status(200).json({ success: true, message: 'Subcategory disabled successfully.', data: subcategory });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to disable subcategory' } });
    }
  }

  // ==========================================
  // Professional Plans Governance (Section 13, 14)
  // ==========================================

  static async getPlans(_req: Request, res: Response) {
    try {
      const plans = await prisma.professionalPlan.findMany({
        orderBy: { displayOrder: 'asc' },
      });
      return res.status(200).json({ success: true, data: plans });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch plans' } });
    }
  }

  static async createPlan(req: Request, res: Response) {
    try {
      const { name, slug, price, baseCredits, bonusCredits, visibilityTier, description, isPopular, displayOrder } = req.body;
      const totalCredits = (Number(baseCredits) || 0) + (Number(bonusCredits) || 0);

      const plan = await prisma.professionalPlan.create({
        data: {
          name,
          slug: slug.toLowerCase().trim(),
          price: Number(price),
          baseCredits: Number(baseCredits),
          bonusCredits: Number(bonusCredits) || 0,
          totalCredits,
          visibilityTier: visibilityTier || 'STANDARD',
          description: description || null,
          isPopular: Boolean(isPopular),
          displayOrder: Number(displayOrder) || 0,
          isActive: true,
        },
      });

      return res.status(201).json({ success: true, message: 'Plan created successfully.', data: plan });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to create plan' } });
    }
  }

  static async updatePlan(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, slug, price, baseCredits, bonusCredits, visibilityTier, description, isPopular, displayOrder, isActive } = req.body;

      const existing = await prisma.professionalPlan.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, error: { message: 'Plan not found' } });
      }

      const finalBase = baseCredits !== undefined ? Number(baseCredits) : existing.baseCredits;
      const finalBonus = bonusCredits !== undefined ? Number(bonusCredits) : existing.bonusCredits;
      const totalCredits = finalBase + finalBonus;

      const plan = await prisma.professionalPlan.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(slug && { slug: slug.toLowerCase().trim() }),
          ...(price !== undefined && { price: Number(price) }),
          ...(baseCredits !== undefined && { baseCredits: finalBase }),
          ...(bonusCredits !== undefined && { bonusCredits: finalBonus }),
          totalCredits,
          ...(visibilityTier && { visibilityTier }),
          ...(description !== undefined && { description }),
          ...(isPopular !== undefined && { isPopular: Boolean(isPopular) }),
          ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });

      return res.status(200).json({ success: true, message: 'Plan updated successfully.', data: plan });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update plan' } });
    }
  }

  // ==========================================
  // Customer Boost Packages Governance (Section 25)
  // ==========================================

  static async getBoostPackages(_req: Request, res: Response) {
    try {
      const packages = await prisma.boostPackage.findMany({
        orderBy: { displayOrder: 'asc' },
      });
      return res.status(200).json({ success: true, data: packages });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch boost packages' } });
    }
  }

  static async createBoostPackage(req: Request, res: Response) {
    try {
      const { name, slug, durationDays, price, priority, description, displayOrder } = req.body;
      const pkg = await prisma.boostPackage.create({
        data: {
          name,
          slug: slug.toLowerCase().trim(),
          durationDays: Number(durationDays),
          price: Number(price),
          priority: Number(priority) || 1,
          description: description || null,
          displayOrder: Number(displayOrder) || 0,
          isActive: true,
        },
      });

      return res.status(201).json({ success: true, message: 'Boost package created successfully.', data: pkg });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to create boost package' } });
    }
  }

  static async updateBoostPackage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, slug, durationDays, price, priority, description, displayOrder, isActive } = req.body;

      const pkg = await prisma.boostPackage.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(slug && { slug: slug.toLowerCase().trim() }),
          ...(durationDays !== undefined && { durationDays: Number(durationDays) }),
          ...(price !== undefined && { price: Number(price) }),
          ...(priority !== undefined && { priority: Number(priority) }),
          ...(description !== undefined && { description }),
          ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });

      return res.status(200).json({ success: true, message: 'Boost package updated successfully.', data: pkg });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update boost package' } });
    }
  }

  // ==========================================
  // Credit Batches & Ledger Governance (Section 18, 20)
  // ==========================================

  static async getCreditBatches(_req: Request, res: Response) {
    try {
      const batches = await prisma.creditBatch.findMany({
        include: {
          professional: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true, phone: true } },
            },
          },
          planPurchase: { include: { plan: true } },
        },
        orderBy: { grantedAt: 'desc' },
        take: 100,
      });

      return res.status(200).json({ success: true, data: batches });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch credit batches' } });
    }
  }

  static async getCreditLedger(_req: Request, res: Response) {
    try {
      const ledger = await prisma.creditLedger.findMany({
        include: {
          professional: {
            include: {
              user: { select: { firstName: true, lastName: true, email: true, phone: true } },
            },
          },
          batch: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      return res.status(200).json({ success: true, data: ledger });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch credit ledger' } });
    }
  }

  static async triggerBatchExpiry(_req: Request, res: Response) {
    try {
      const results = await CreditService.processExpiredBatches();
      return res.status(200).json({
        success: true,
        message: `Processed ${results.processedCount} expired credit batches.`,
        data: results,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to process expired batches' },
      });
    }
  }

  /**
   * Communication Moderation
   */
  static async getReports(req: Request, res: Response) {
    try {
      const { status, page, limit } = req.query;
      const { ReportService } = await import('../services/report.service');
      const data = await ReportService.getReports({
        status: status as string,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch reports' } });
    }
  }

  static async getReportById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { ReportService } = await import('../services/report.service');
      const report = await ReportService.getReportById(id);
      if (!report) {
        return res.status(404).json({ success: false, error: { message: 'Report not found' } });
      }
      return res.status(200).json({ success: true, data: report });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch report' } });
    }
  }

  static async resolveReport(req: Request, res: Response) {
    try {
      const adminUserId = req.user!.id;
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const { ReportService } = await import('../services/report.service');
      const updated = await ReportService.resolveReport(adminUserId, id, { status, adminNotes });
      return res.status(200).json({ success: true, message: 'Report resolved', data: updated });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: { message: error.message || 'Failed to resolve report' } });
    }
  }

  // ============================================================================
  // MULTI-SELECT BULK ACTIONS (DELETE, APPROVE, VERIFY, STATUS CHANGE)
  // ============================================================================

  /**
   * POST /api/v1/admin/users/bulk-action
   * Multi-select batch operations: DELETE, STATUS_UPDATE, VERIFY
   */
  static async bulkUsersAction(req: Request, res: Response) {
    try {
      const { userIds, action, status } = req.body;
      const adminId = req.user?.id;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'userIds array is required' } });
      }

      // Filter out admin's own ID for safety
      const targetIds = userIds.filter((id) => id !== adminId);
      let affectedCount = 0;

      if (action === 'DELETE') {
        for (const id of targetIds) {
          try {
            await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {});
            await prisma.refreshToken.deleteMany({ where: { userId: id } }).catch(() => {});
            await prisma.notification.deleteMany({ where: { userId: id } }).catch(() => {});
            await prisma.user.delete({ where: { id } });
            affectedCount++;
          } catch {
            await prisma.user.update({
              where: { id },
              data: { status: 'DELETED', deletedAt: new Date() },
            }).catch(() => {});
            affectedCount++;
          }
        }
      } else if (action === 'STATUS_UPDATE') {
        const validStatus = ['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(status) ? status : 'ACTIVE';
        const result = await prisma.user.updateMany({
          where: { id: { in: targetIds } },
          data: { status: validStatus },
        });
        affectedCount = result.count;
      } else if (action === 'VERIFY') {
        const profs = await prisma.professionalProfile.findMany({
          where: { userId: { in: targetIds } },
          select: { id: true },
        });
        const profIds = profs.map((p) => p.id);
        if (profIds.length > 0) {
          await prisma.professionalProfile.updateMany({
            where: { id: { in: profIds } },
            data: { isVerified: true },
          });
          await prisma.verification.updateMany({
            where: { professionalProfileId: { in: profIds } },
            data: { status: 'VERIFIED', verifiedAt: new Date() },
          });
        }
        affectedCount = profIds.length;
      } else {
        return res.status(400).json({ success: false, error: { message: `Unknown action: ${action}` } });
      }

      return res.status(200).json({
        success: true,
        message: `Bulk ${action} executed successfully on ${affectedCount} users.`,
        data: { affectedCount },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to execute bulk user action' },
      });
    }
  }

  /**
   * POST /api/v1/admin/verifications/bulk-action
   * Multi-select batch operations: APPROVE, REJECT, RESET, DELETE
   */
  static async bulkVerificationsAction(req: Request, res: Response) {
    try {
      const { verificationIds, action, rejectionReason } = req.body;

      if (!Array.isArray(verificationIds) || verificationIds.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'verificationIds array is required' } });
      }

      let affectedCount = 0;

      if (action === 'APPROVE') {
        for (const id of verificationIds) {
          const ver = await prisma.verification.findUnique({
            where: { id },
            select: { id: true, professionalProfileId: true },
          });
          if (ver) {
            await prisma.verification.update({
              where: { id },
              data: {
                status: 'VERIFIED',
                verifiedAt: new Date(),
                rejectionReason: null,
              },
            });
            if (ver.professionalProfileId) {
              await prisma.professionalProfile.update({
                where: { id: ver.professionalProfileId },
                data: { isVerified: true },
              });
            }
            affectedCount++;
          }
        }
      } else if (action === 'REJECT') {
        for (const id of verificationIds) {
          const ver = await prisma.verification.findUnique({
            where: { id },
            select: { id: true, professionalProfileId: true },
          });
          if (ver) {
            await prisma.verification.update({
              where: { id },
              data: {
                status: 'REJECTED',
                rejectionReason: rejectionReason || 'Bulk rejected by administrator',
              },
            });
            if (ver.professionalProfileId) {
              await prisma.professionalProfile.update({
                where: { id: ver.professionalProfileId },
                data: { isVerified: false },
              });
            }
            affectedCount++;
          }
        }
      } else if (action === 'RESET') {
        const result = await prisma.verification.updateMany({
          where: { id: { in: verificationIds } },
          data: { status: 'PENDING', rejectionReason: null },
        });
        affectedCount = result.count;
      } else if (action === 'DELETE') {
        const result = await prisma.verification.deleteMany({
          where: { id: { in: verificationIds } },
        });
        affectedCount = result.count;
      } else {
        return res.status(400).json({ success: false, error: { message: `Unknown action: ${action}` } });
      }

      return res.status(200).json({
        success: true,
        message: `Bulk ${action} executed successfully on ${affectedCount} verifications.`,
        data: { affectedCount },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to execute bulk verification action' },
      });
    }
  }

  /**
   * POST /api/v1/admin/requirements/bulk-action
   * Multi-select batch operations: STATUS_UPDATE, DELETE
   */
  static async bulkRequirementsAction(req: Request, res: Response) {
    try {
      const { requirementIds, action, status } = req.body;

      if (!Array.isArray(requirementIds) || requirementIds.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'requirementIds array is required' } });
      }

      let affectedCount = 0;

      if (action === 'STATUS_UPDATE') {
        const validStatus = ['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED', 'COMPLETED'].includes(status)
          ? status
          : 'CLOSED';
        const result = await prisma.requirement.updateMany({
          where: { id: { in: requirementIds } },
          data: { status: validStatus },
        });
        affectedCount = result.count;
      } else if (action === 'DELETE') {
        for (const id of requirementIds) {
          await prisma.quotation.deleteMany({ where: { requirementId: id } }).catch(() => {});
          await prisma.requirement.delete({ where: { id } }).catch(() => {});
          affectedCount++;
        }
      } else {
        return res.status(400).json({ success: false, error: { message: `Unknown action: ${action}` } });
      }

      return res.status(200).json({
        success: true,
        message: `Bulk ${action} executed successfully on ${affectedCount} requirements.`,
        data: { affectedCount },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to execute bulk requirement action' },
      });
    }
  }

  /**
   * POST /api/v1/admin/jobs/bulk-action
   * Multi-select batch operations: STATUS_UPDATE, DELETE
   */
  static async bulkJobsAction(req: Request, res: Response) {
    try {
      const { jobIds, action, status } = req.body;

      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'jobIds array is required' } });
      }

      let affectedCount = 0;

      if (action === 'STATUS_UPDATE') {
        const result = await prisma.job.updateMany({
          where: { id: { in: jobIds } },
          data: { status },
        });
        affectedCount = result.count;
      } else if (action === 'DELETE') {
        const result = await prisma.job.deleteMany({
          where: { id: { in: jobIds } },
        });
        affectedCount = result.count;
      } else {
        return res.status(400).json({ success: false, error: { message: `Unknown action: ${action}` } });
      }

      return res.status(200).json({
        success: true,
        message: `Bulk ${action} executed successfully on ${affectedCount} jobs.`,
        data: { affectedCount },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to execute bulk job action' },
      });
    }
  }

  /**
   * POST /api/v1/admin/reports/bulk-action
   * Multi-select batch operations: RESOLVE, DISMISS, DELETE
   */
  static async bulkReportsAction(req: Request, res: Response) {
    try {
      const { reportIds, action, adminNotes } = req.body;

      if (!Array.isArray(reportIds) || reportIds.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'reportIds array is required' } });
      }

      let affectedCount = 0;

      if (action === 'RESOLVE' || action === 'DISMISS') {
        const newStatus = action === 'RESOLVE' ? 'RESOLVED' : 'DISMISSED';
        const result = await prisma.conversationReport.updateMany({
          where: { id: { in: reportIds } },
          data: {
            status: newStatus,
            adminNotes: adminNotes || `Bulk ${action.toLowerCase()}d by administrator`,
          },
        });
        affectedCount = result.count;
      } else if (action === 'DELETE') {
        const result = await prisma.conversationReport.deleteMany({
          where: { id: { in: reportIds } },
        });
        affectedCount = result.count;
      } else {
        return res.status(400).json({ success: false, error: { message: `Unknown action: ${action}` } });
      }

      return res.status(200).json({
        success: true,
        message: `Bulk ${action} executed successfully on ${affectedCount} reports.`,
        data: { affectedCount },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to execute bulk report action' },
      });
    }
  }

  // ============================================================================
  // EMPLOYEE & STAFF GOVERNANCE (ROLES: SUPPORT, FINANCE, VERIFICATION, ADMIN)
  // ============================================================================

  /**
   * GET /api/v1/admin/employees
   * Returns all staff members who have administrative or operational roles
   */
  static async getEmployees(req: Request, res: Response) {
    try {
      const staffRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'VERIFICATION_ADMIN'];
      const users = await prisma.user.findMany({
        where: {
          roles: {
            some: {
              role: {
                name: { in: staffRoles },
              },
            },
          },
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const sanitized = users.map((u) => {
        const roleNames = u.roles.map((r) => r.role.name);
        const primaryRole =
          roleNames.find((rn) => staffRoles.includes(rn)) || 'SUPPORT';
        return {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          phone: u.phone,
          status: u.status,
          roles: roleNames,
          role: primaryRole,
          emailVerifiedAt: u.emailVerifiedAt,
          phoneVerifiedAt: u.phoneVerifiedAt,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        };
      });

      return res.status(200).json({
        success: true,
        data: sanitized,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch employees' },
      });
    }
  }

  /**
   * POST /api/v1/admin/employees
   * Create a new employee with designated role (SUPPORT, FINANCE, VERIFICATION_ADMIN, ADMIN, SUPER_ADMIN)
   */
  static async createEmployee(req: Request, res: Response) {
    try {
      const { firstName, lastName, email, phone, role, password } = req.body;

      if (!firstName || !firstName.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: 'First name is required.' },
        });
      }

      if (!email || !email.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: 'Work email address is required.' },
        });
      }

      const canonicalEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(canonicalEmail)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Please provide a valid work email address.' },
        });
      }

      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'VERIFICATION_ADMIN'];
      const targetRole = (role || 'SUPPORT').toUpperCase();
      if (!validRoles.includes(targetRole)) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid staff role. Must be one of: ${validRoles.join(', ')}` },
        });
      }

      if (!password || password.length < 6) {
        return res.status(400).json({
          success: false,
          error: { message: 'Password must be at least 6 characters long.' },
        });
      }

      // Check for duplicate email
      const existingUserByEmail = await prisma.user.findFirst({
        where: { email: canonicalEmail },
      });
      if (existingUserByEmail) {
        return res.status(409).json({
          success: false,
          error: { message: 'A user with this email address already exists.' },
        });
      }

      // Format & check phone if provided
      let canonicalPhone: string | null = null;
      if (phone && phone.trim()) {
        const digits = phone.replace(/\D/g, '');
        const last10 = digits.slice(-10);
        if (last10.length === 10) {
          canonicalPhone = `+91${last10}`;
          const existingPhone = await prisma.user.findFirst({
            where: {
              OR: [
                { phone: canonicalPhone },
                { phone: last10 },
                { phone: `91${last10}` },
              ],
            },
          });
          if (existingPhone) {
            return res.status(409).json({
              success: false,
              error: { message: 'A user with this phone number already exists.' },
            });
          }
        }
      }

      // Ensure the Role record exists
      let roleRecord = await prisma.role.findUnique({
        where: { name: targetRole },
      });
      if (!roleRecord) {
        roleRecord = await prisma.role.create({
          data: {
            name: targetRole,
            description: `${targetRole} staff role`,
          },
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const newUser = await prisma.user.create({
        data: {
          firstName: firstName.trim(),
          lastName: (lastName || '').trim(),
          email: canonicalEmail,
          phone: canonicalPhone,
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: canonicalPhone ? new Date() : null,
          roles: {
            create: {
              roleId: roleRecord.id,
            },
          },
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      return res.status(201).json({
        success: true,
        message: `Employee account created successfully with ${targetRole} role.`,
        data: {
          id: newUser.id,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          phone: newUser.phone,
          status: newUser.status,
          roles: newUser.roles.map((r) => r.role.name),
          role: targetRole,
          createdAt: newUser.createdAt,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create employee' },
      });
    }
  }

  /**
   * PUT /api/v1/admin/employees/:id
   * Update an employee's profile details or reassign their staff role
   */
  static async updateEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { firstName, lastName, email, phone, role, status } = req.body;

      const user = await prisma.user.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: { message: 'Employee not found.' },
        });
      }

      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName.trim();
      if (lastName !== undefined) updateData.lastName = (lastName || '').trim();
      if (status !== undefined) updateData.status = status;

      if (email !== undefined && email.trim() !== '') {
        const canonicalEmail = email.trim().toLowerCase();
        if (canonicalEmail !== user.email) {
          const emailCheck = await prisma.user.findFirst({
            where: { email: canonicalEmail, id: { not: id } },
          });
          if (emailCheck) {
            return res.status(409).json({
              success: false,
              error: { message: 'Another user with this email address already exists.' },
            });
          }
          updateData.email = canonicalEmail;
        }
      }

      if (phone !== undefined) {
        if (!phone.trim()) {
          updateData.phone = null;
        } else {
          const digits = phone.replace(/\D/g, '');
          const last10 = digits.slice(-10);
          if (last10.length === 10) {
            const canonicalPhone = `+91${last10}`;
            if (canonicalPhone !== user.phone) {
              const phoneCheck = await prisma.user.findFirst({
                where: {
                  id: { not: id },
                  OR: [
                    { phone: canonicalPhone },
                    { phone: last10 },
                    { phone: `91${last10}` },
                  ],
                },
              });
              if (phoneCheck) {
                return res.status(409).json({
                  success: false,
                  error: { message: 'Another user with this phone number already exists.' },
                });
              }
              updateData.phone = canonicalPhone;
            }
          }
        }
      }

      // Update user details
      await prisma.user.update({
        where: { id },
        data: updateData,
      });

      // Update role if requested
      if (role) {
        const validRoles = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'VERIFICATION_ADMIN'];
        const targetRole = role.toUpperCase();
        if (validRoles.includes(targetRole)) {
          let roleRecord = await prisma.role.findUnique({
            where: { name: targetRole },
          });
          if (!roleRecord) {
            roleRecord = await prisma.role.create({
              data: { name: targetRole, description: `${targetRole} staff role` },
            });
          }

          // Delete existing staff roles for this user
          const staffRoleNames = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'VERIFICATION_ADMIN'];
          const userStaffRoleIds = user.roles
            .filter((ur) => staffRoleNames.includes(ur.role.name))
            .map((ur) => ur.roleId);

          if (userStaffRoleIds.length > 0) {
            await prisma.userRole.deleteMany({
              where: {
                userId: id,
                roleId: { in: userStaffRoleIds },
              },
            });
          }

          // Connect new role
          await prisma.userRole.create({
            data: {
              userId: id,
              roleId: roleRecord.id,
            },
          });
        }
      }

      const refreshed = await prisma.user.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } },
      });

      const staffRoleNames = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'VERIFICATION_ADMIN'];
      const refreshedRoles = refreshed!.roles.map((r) => r.role.name);
      const primaryRole = refreshedRoles.find((r) => staffRoleNames.includes(r)) || role || 'SUPPORT';

      return res.status(200).json({
        success: true,
        message: 'Employee updated successfully.',
        data: {
          id: refreshed!.id,
          firstName: refreshed!.firstName,
          lastName: refreshed!.lastName,
          email: refreshed!.email,
          phone: refreshed!.phone,
          status: refreshed!.status,
          roles: refreshedRoles,
          role: primaryRole,
          updatedAt: refreshed!.updatedAt,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update employee' },
      });
    }
  }

  /**
   * PATCH /api/v1/admin/employees/:id/status
   * Activate or suspend an employee
   */
  static async updateEmployeeStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (id === req.user?.id) {
        return res.status(400).json({
          success: false,
          error: { message: 'You cannot change your own account status.' },
        });
      }

      const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: { message: `Status must be one of: ${validStatuses.join(', ')}` },
        });
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { status },
      });

      return res.status(200).json({
        success: true,
        message: `Employee status changed to ${status}`,
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update employee status' },
      });
    }
  }

  /**
   * POST /api/v1/admin/employees/:id/reset-password
   * Directly reset an employee's password
   */
  static async resetEmployeePassword(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: { message: 'Password must be at least 6 characters long.' },
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });

      return res.status(200).json({
        success: true,
        message: 'Employee password reset successfully.',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to reset employee password' },
      });
    }
  }

  /**
   * DELETE /api/v1/admin/employees/:id
   * Revoke employee staff access / remove employee
   */
  static async deleteEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (id === req.user?.id) {
        return res.status(400).json({
          success: false,
          error: { message: 'You cannot delete your own administrator account.' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          roles: { include: { role: true } },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: { message: 'Employee not found.' },
        });
      }

      // Remove staff roles
      const staffRoleNames = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'VERIFICATION_ADMIN'];
      const staffUserRoles = user.roles.filter((ur) => staffRoleNames.includes(ur.role.name));

      if (staffUserRoles.length > 0) {
        await prisma.userRole.deleteMany({
          where: {
            userId: id,
            roleId: { in: staffUserRoles.map((ur) => ur.roleId) },
          },
        });
      }

      // If user has no other roles (like CUSTOMER or PROFESSIONAL), safely delete the user record
      const remainingRoles = await prisma.userRole.count({ where: { userId: id } });
      if (remainingRoles === 0) {
        await prisma.user.delete({
          where: { id },
        }).catch(async () => {
          // Fallback if foreign key constraints exist: mark as INACTIVE
          await prisma.user.update({
            where: { id },
            data: { status: 'INACTIVE' },
          });
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Employee removed successfully.',
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to remove employee' },
      });
    }
  }
}
