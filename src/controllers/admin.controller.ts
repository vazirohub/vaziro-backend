import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
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
}
