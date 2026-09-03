"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const prisma_1 = require("../lib/prisma");
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
}
exports.AdminController = AdminController;
