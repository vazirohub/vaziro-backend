"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../lib/prisma");
const credit_service_1 = require("../services/credit.service");
class AdminController {
    /**
     * GET /api/v1/admin/metrics
     */
    static async getMetrics(req, res) {
        try {
            const [totalUsers, totalCustomers, totalProfessionals, verifiedProfessionals, totalRequirements, activeJobs, completedJobs, totalCreditsSpent, totalPayments, openDisputes,] = await Promise.all([
                prisma_1.prisma.user.count(),
                prisma_1.prisma.customerProfile.count(),
                prisma_1.prisma.professionalProfile.count(),
                prisma_1.prisma.professionalProfile.count({ where: { isVerified: true } }),
                prisma_1.prisma.requirement.count(),
                prisma_1.prisma.job.count({ where: { status: { in: ['HIRED', 'SCHEDULED', 'PREPARING', 'ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED'] } } }),
                prisma_1.prisma.job.count({ where: { status: { in: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'PAYMENT_RELEASED', 'CLOSED'] } } }),
                prisma_1.prisma.creditTransaction.aggregate({
                    where: { transactionType: 'APPLICATION_DEBIT' },
                    _sum: { amount: true },
                }),
                prisma_1.prisma.payment.aggregate({
                    where: { status: { in: ['SECURED', 'COMPLETED'] } },
                    _sum: { amount: true },
                }),
                prisma_1.prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }),
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch admin metrics' },
            });
        }
    }
    /**
     * GET /api/v1/admin/users
     */
    static async getUsers(req, res) {
        try {
            const users = await prisma_1.prisma.user.findMany({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch users' },
            });
        }
    }
    /**
     * PATCH /api/v1/admin/users/:id/status
     */
    static async updateUserStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const updated = await prisma_1.prisma.user.update({
                where: { id },
                data: { status },
            });
            return res.status(200).json({
                success: true,
                message: `User status updated to ${status}`,
                data: updated,
            });
        }
        catch (error) {
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
    static async adjustUserCredits(req, res) {
        try {
            const { id } = req.params;
            const { amount, mode, notes } = req.body; // mode: 'ADD' | 'DEDUCT' | 'SET'
            if (amount === undefined || isNaN(Number(amount))) {
                return res.status(400).json({ success: false, error: { message: 'Valid numerical amount is required.' } });
            }
            const numAmount = Math.round(Number(amount));
            const validMode = ['ADD', 'DEDUCT', 'SET'].includes(mode) ? mode : 'ADD';
            const user = await prisma_1.prisma.user.findUnique({
                where: { id },
                include: { professionalProfile: { include: { creditWallet: true } } },
            });
            if (!user) {
                return res.status(404).json({ success: false, error: { message: 'User not found.' } });
            }
            // Ensure user has a professional profile
            let prof = user.professionalProfile;
            if (!prof) {
                prof = await prisma_1.prisma.professionalProfile.create({
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
                wallet = await prisma_1.prisma.creditWallet.create({
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
            }
            else if (validMode === 'DEDUCT') {
                newBalance = Math.max(0, wallet.balance - Math.abs(numAmount));
            }
            else if (validMode === 'SET') {
                newBalance = Math.max(0, numAmount);
            }
            const diff = newBalance - wallet.balance;
            const updated = await prisma_1.prisma.$transaction(async (tx) => {
                const updatedWallet = await tx.creditWallet.update({
                    where: { id: wallet.id },
                    data: {
                        balance: newBalance,
                        lifetimePurchased: diff > 0 ? wallet.lifetimePurchased + diff : wallet.lifetimePurchased,
                    },
                });
                const txRecord = await tx.creditTransaction.create({
                    data: {
                        creditWalletId: wallet.id,
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
        }
        catch (error) {
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
    static async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { firstName, lastName, email, phone, status, roles, isVerified } = req.body;
            const existing = await prisma_1.prisma.user.findUnique({
                where: { id },
                include: { professionalProfile: true },
            });
            if (!existing) {
                return res.status(404).json({ success: false, error: { message: 'User not found.' } });
            }
            const updateData = {};
            if (firstName !== undefined)
                updateData.firstName = firstName.trim();
            if (lastName !== undefined)
                updateData.lastName = lastName.trim();
            if (email !== undefined)
                updateData.email = email.trim().toLowerCase();
            if (phone !== undefined)
                updateData.phone = phone.trim();
            if (status !== undefined)
                updateData.status = status;
            await prisma_1.prisma.user.update({
                where: { id },
                data: updateData,
            });
            if (Array.isArray(roles) && roles.length > 0) {
                const matchedRoles = await prisma_1.prisma.role.findMany({
                    where: { name: { in: roles } },
                });
                if (matchedRoles.length > 0) {
                    await prisma_1.prisma.userRole.deleteMany({
                        where: { userId: id },
                    });
                    await prisma_1.prisma.userRole.createMany({
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
                    prof = await prisma_1.prisma.professionalProfile.create({
                        data: {
                            userId: id,
                            title: 'Service Professional',
                            isVerified: Boolean(isVerified),
                        },
                    });
                }
                else {
                    await prisma_1.prisma.professionalProfile.update({
                        where: { id: prof.id },
                        data: { isVerified: Boolean(isVerified) },
                    });
                }
                await prisma_1.prisma.verification.upsert({
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
            const finalUser = await prisma_1.prisma.user.findUnique({
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
            const { passwordHash, ...rest } = finalUser;
            return res.status(200).json({
                success: true,
                message: 'User details updated successfully.',
                data: rest,
            });
        }
        catch (error) {
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
    static async resetUserPassword(req, res) {
        try {
            const { id } = req.params;
            const { newPassword } = req.body;
            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Password must be at least 6 characters long.' },
                });
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id } });
            if (!user) {
                return res.status(404).json({ success: false, error: { message: 'User not found.' } });
            }
            const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
            await prisma_1.prisma.user.update({
                where: { id },
                data: { passwordHash },
            });
            return res.status(200).json({
                success: true,
                message: `Password for ${user.firstName} ${user.lastName} has been reset successfully.`,
            });
        }
        catch (error) {
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
    static async deleteUser(req, res) {
        try {
            const { id } = req.params;
            const adminId = req.user?.id;
            if (id === adminId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'You cannot delete your own admin account.' },
                });
            }
            const user = await prisma_1.prisma.user.findUnique({ where: { id } });
            if (!user) {
                return res.status(404).json({ success: false, error: { message: 'User not found.' } });
            }
            await prisma_1.prisma.user.delete({ where: { id } });
            return res.status(200).json({
                success: true,
                message: `User ${user.firstName} ${user.lastName} deleted successfully.`,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to delete user' },
            });
        }
    }
    /**
     * GET /api/v1/admin/verifications
     */
    static async getVerifications(req, res) {
        try {
            const verifications = await prisma_1.prisma.verification.findMany({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch verification queue' },
            });
        }
    }
    /**
     * PATCH /api/v1/admin/verifications/:id
     */
    static async reviewVerification(req, res) {
        try {
            const { id } = req.params;
            const { status, rejectionReason } = req.body;
            const verification = await prisma_1.prisma.verification.findUnique({
                where: { id },
            });
            if (!verification) {
                return res.status(404).json({ success: false, error: { message: 'Verification not found' } });
            }
            const updated = await prisma_1.prisma.$transaction(async (tx) => {
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to review verification' },
            });
        }
    }
    /**
     * GET /api/v1/admin/settings
     */
    static async getSettings(req, res) {
        try {
            const settings = await prisma_1.prisma.systemSetting.findMany({
                orderBy: { key: 'asc' },
            });
            return res.status(200).json({
                success: true,
                data: settings,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch settings' },
            });
        }
    }
    /**
     * PUT /api/v1/admin/settings
     */
    static async updateSetting(req, res) {
        try {
            const { key, value } = req.body;
            const adminId = req.user?.id;
            if (!key || value === undefined) {
                return res.status(400).json({ success: false, error: { message: 'key and value are required.' } });
            }
            const updated = await prisma_1.prisma.systemSetting.upsert({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update system setting' },
            });
        }
    }
    /**
     * GET /api/v1/admin/locations
     */
    static async getAllLocations(req, res) {
        try {
            const states = await prisma_1.prisma.state.findMany({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch admin locations' },
            });
        }
    }
    /**
     * PATCH /api/v1/admin/locations/toggle
     */
    static async toggleLocation(req, res) {
        try {
            const { type, id, isActive } = req.body;
            if (!type || !id || isActive === undefined) {
                return res.status(400).json({ success: false, error: { message: 'type (state|city|area|pincode), id, and isActive are required.' } });
            }
            let result;
            if (type === 'state') {
                result = await prisma_1.prisma.state.update({ where: { id }, data: { isActive } });
            }
            else if (type === 'city') {
                result = await prisma_1.prisma.city.update({ where: { id }, data: { isActive } });
            }
            else if (type === 'area') {
                result = await prisma_1.prisma.area.update({ where: { id }, data: { isActive } });
            }
            else if (type === 'pincode') {
                result = await prisma_1.prisma.pincode.update({ where: { id }, data: { isActive } });
            }
            else {
                return res.status(400).json({ success: false, error: { message: 'Invalid location type' } });
            }
            return res.status(200).json({
                success: true,
                message: `${type} status set to ${isActive ? 'ACTIVE' : 'INACTIVE'}`,
                data: result,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to toggle location' },
            });
        }
    }
    /**
     * GET /api/v1/admin/requirements
     */
    static async getRequirements(req, res) {
        try {
            const requirements = await prisma_1.prisma.requirement.findMany({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch requirements' },
            });
        }
    }
    /**
     * PATCH /api/v1/admin/requirements/:id/status
     */
    static async updateRequirementStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const reqRecord = await prisma_1.prisma.requirement.update({
                where: { id },
                data: { status },
            });
            return res.status(200).json({
                success: true,
                message: `Requirement status updated to ${status}`,
                data: reqRecord,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update requirement status' },
            });
        }
    }
    /**
     * GET /api/v1/admin/jobs
     */
    static async getJobs(req, res) {
        try {
            const jobs = await prisma_1.prisma.job.findMany({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch jobs' },
            });
        }
    }
    /**
     * PATCH /api/v1/admin/jobs/:id/status
     */
    static async updateJobStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, reason } = req.body;
            const job = await prisma_1.prisma.job.update({
                where: { id },
                data: { status },
            });
            await prisma_1.prisma.jobStatusHistory.create({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update job status' },
            });
        }
    }
    // ==========================================
    // Categories & Subcategories Governance
    // ==========================================
    static async createCategory(req, res) {
        try {
            const { name, slug, icon, description } = req.body;
            if (!name || !slug) {
                return res.status(400).json({ success: false, error: { message: 'Name and slug are required.' } });
            }
            const category = await prisma_1.prisma.category.create({
                data: {
                    name,
                    slug: slug.toLowerCase().trim(),
                    icon: icon || 'Briefcase',
                    description: description || null,
                    isActive: true,
                },
            });
            return res.status(201).json({ success: true, message: 'Category created successfully.', data: category });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to create category' } });
        }
    }
    static async updateCategory(req, res) {
        try {
            const { id } = req.params;
            const { name, slug, icon, description, isActive } = req.body;
            const category = await prisma_1.prisma.category.update({
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update category' } });
        }
    }
    static async deleteCategory(req, res) {
        try {
            const { id } = req.params;
            // Soft disable category to maintain relational integrity
            const category = await prisma_1.prisma.category.update({
                where: { id },
                data: { isActive: false },
            });
            return res.status(200).json({ success: true, message: 'Category disabled successfully.', data: category });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to disable category' } });
        }
    }
    static async createSubcategory(req, res) {
        try {
            const { categoryId, name, slug, description } = req.body;
            if (!categoryId || !name || !slug) {
                return res.status(400).json({ success: false, error: { message: 'categoryId, name, and slug are required.' } });
            }
            const subcategory = await prisma_1.prisma.subcategory.create({
                data: {
                    categoryId,
                    name,
                    slug: slug.toLowerCase().trim(),
                    description: description || null,
                    isActive: true,
                },
            });
            return res.status(201).json({ success: true, message: 'Subcategory created successfully.', data: subcategory });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to create subcategory' } });
        }
    }
    static async updateSubcategory(req, res) {
        try {
            const { id } = req.params;
            const { name, slug, description, isActive, categoryId } = req.body;
            const subcategory = await prisma_1.prisma.subcategory.update({
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update subcategory' } });
        }
    }
    static async deleteSubcategory(req, res) {
        try {
            const { id } = req.params;
            const subcategory = await prisma_1.prisma.subcategory.update({
                where: { id },
                data: { isActive: false },
            });
            return res.status(200).json({ success: true, message: 'Subcategory disabled successfully.', data: subcategory });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to disable subcategory' } });
        }
    }
    // ==========================================
    // Professional Plans Governance (Section 13, 14)
    // ==========================================
    static async getPlans(_req, res) {
        try {
            const plans = await prisma_1.prisma.professionalPlan.findMany({
                orderBy: { displayOrder: 'asc' },
            });
            return res.status(200).json({ success: true, data: plans });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch plans' } });
        }
    }
    static async createPlan(req, res) {
        try {
            const { name, slug, price, baseCredits, bonusCredits, visibilityTier, description, isPopular, displayOrder } = req.body;
            const totalCredits = (Number(baseCredits) || 0) + (Number(bonusCredits) || 0);
            const plan = await prisma_1.prisma.professionalPlan.create({
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to create plan' } });
        }
    }
    static async updatePlan(req, res) {
        try {
            const { id } = req.params;
            const { name, slug, price, baseCredits, bonusCredits, visibilityTier, description, isPopular, displayOrder, isActive } = req.body;
            const existing = await prisma_1.prisma.professionalPlan.findUnique({ where: { id } });
            if (!existing) {
                return res.status(404).json({ success: false, error: { message: 'Plan not found' } });
            }
            const finalBase = baseCredits !== undefined ? Number(baseCredits) : existing.baseCredits;
            const finalBonus = bonusCredits !== undefined ? Number(bonusCredits) : existing.bonusCredits;
            const totalCredits = finalBase + finalBonus;
            const plan = await prisma_1.prisma.professionalPlan.update({
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update plan' } });
        }
    }
    // ==========================================
    // Customer Boost Packages Governance (Section 25)
    // ==========================================
    static async getBoostPackages(_req, res) {
        try {
            const packages = await prisma_1.prisma.boostPackage.findMany({
                orderBy: { displayOrder: 'asc' },
            });
            return res.status(200).json({ success: true, data: packages });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch boost packages' } });
        }
    }
    static async createBoostPackage(req, res) {
        try {
            const { name, slug, durationDays, price, priority, description, displayOrder } = req.body;
            const pkg = await prisma_1.prisma.boostPackage.create({
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to create boost package' } });
        }
    }
    static async updateBoostPackage(req, res) {
        try {
            const { id } = req.params;
            const { name, slug, durationDays, price, priority, description, displayOrder, isActive } = req.body;
            const pkg = await prisma_1.prisma.boostPackage.update({
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update boost package' } });
        }
    }
    // ==========================================
    // Credit Batches & Ledger Governance (Section 18, 20)
    // ==========================================
    static async getCreditBatches(_req, res) {
        try {
            const batches = await prisma_1.prisma.creditBatch.findMany({
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch credit batches' } });
        }
    }
    static async getCreditLedger(_req, res) {
        try {
            const ledger = await prisma_1.prisma.creditLedger.findMany({
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message || 'Failed to fetch credit ledger' } });
        }
    }
    static async triggerBatchExpiry(_req, res) {
        try {
            const results = await credit_service_1.CreditService.processExpiredBatches();
            return res.status(200).json({
                success: true,
                message: `Processed ${results.processedCount} expired credit batches.`,
                data: results,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to process expired batches' },
            });
        }
    }
}
exports.AdminController = AdminController;
