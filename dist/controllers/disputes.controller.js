"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisputesController = void 0;
const prisma_1 = require("../lib/prisma");
class DisputesController {
    /**
     * POST /api/v1/disputes
     */
    static async raiseDispute(req, res) {
        try {
            const userId = req.user?.id;
            const { jobId, reason, description, evidenceUrls } = req.body;
            if (!jobId || !reason || !description) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'jobId, reason, and detailed description are required.' },
                });
            }
            const job = await prisma_1.prisma.job.findUnique({
                where: { id: jobId },
                include: { customer: true, professional: true },
            });
            if (!job) {
                return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
            }
            const isCustomer = job.customer.userId === userId;
            const isProf = job.professional.userId === userId;
            if (!isCustomer && !isProf && !req.user?.roles.includes('ADMIN')) {
                return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
            }
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                const dispute = await tx.dispute.create({
                    data: {
                        jobId: job.id,
                        raisedByUserId: userId,
                        reason: `${reason}: ${description}`,
                        amountDisputed: job.agreedPrice,
                        status: 'OPEN',
                        evidences: evidenceUrls && Array.isArray(evidenceUrls) ? {
                            create: evidenceUrls.map((url) => ({
                                userId: userId,
                                fileUrl: url,
                                description: 'Initial dispute evidence attachment',
                            })),
                        } : undefined,
                    },
                });
                await tx.job.update({
                    where: { id: job.id },
                    data: { status: 'DISPUTED' },
                });
                await tx.jobStatusHistory.create({
                    data: {
                        jobId: job.id,
                        previousStatus: job.status,
                        newStatus: 'DISPUTED',
                        changedByUserId: userId,
                        reason: `Formal dispute raised: ${reason}`,
                    },
                });
                await tx.disputeStatusHistory.create({
                    data: {
                        disputeId: dispute.id,
                        previousStatus: 'NEW',
                        newStatus: 'OPEN',
                        changedByUserId: userId,
                        reason: `Dispute opened with reason: ${reason}`,
                    },
                });
                return dispute;
            });
            return res.status(201).json({
                success: true,
                message: 'Dispute submitted. A Vaziro Support Specialist will review the case within 24 hours.',
                data: result,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to raise dispute' },
            });
        }
    }
    /**
     * GET /api/v1/disputes/:id
     */
    static async getDispute(req, res) {
        try {
            const { id } = req.params;
            const dispute = await prisma_1.prisma.dispute.findUnique({
                where: { id },
                include: {
                    job: {
                        include: {
                            requirement: { select: { title: true } },
                        },
                    },
                    raisedBy: { select: { firstName: true, lastName: true, phone: true } },
                    evidences: true,
                    resolutions: true,
                    statusHistory: { orderBy: { createdAt: 'asc' } },
                },
            });
            if (!dispute) {
                return res.status(404).json({ success: false, error: { message: 'Dispute not found' } });
            }
            return res.status(200).json({
                success: true,
                data: {
                    ...dispute,
                    resolution: dispute.resolutions[0] || null,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch dispute' },
            });
        }
    }
    /**
     * POST /api/v1/disputes/:id/resolve
     */
    static async resolveDispute(req, res) {
        try {
            const { id } = req.params;
            const { outcome, refundAmountInr, notes } = req.body;
            const adminId = req.user?.id;
            const validOutcomes = ['FULL_REFUND', 'PARTIAL_REFUND', 'RELEASE_PAYMENT', 'REWORK_REQUESTED', 'MUTUAL_SETTLEMENT', 'NO_ACTION'];
            if (!validOutcomes.includes(outcome)) {
                return res.status(400).json({
                    success: false,
                    error: { message: `Invalid resolution outcome. Allowed: ${validOutcomes.join(', ')}` },
                });
            }
            const dispute = await prisma_1.prisma.dispute.findUnique({
                where: { id },
                include: { job: true },
            });
            if (!dispute) {
                return res.status(404).json({ success: false, error: { message: 'Dispute not found' } });
            }
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                const resolution = await tx.disputeResolution.create({
                    data: {
                        disputeId: dispute.id,
                        arbitratedByUserId: adminId,
                        resolutionOutcome: outcome,
                        refundAmount: refundAmountInr ? Number(refundAmountInr) : 0,
                        notes: notes || `Resolved by support arbitration: ${outcome}`,
                    },
                });
                await tx.dispute.update({
                    where: { id: dispute.id },
                    data: { status: 'RESOLVED' },
                });
                await tx.disputeStatusHistory.create({
                    data: {
                        disputeId: dispute.id,
                        previousStatus: dispute.status,
                        newStatus: 'RESOLVED',
                        changedByUserId: adminId,
                        reason: `Resolved with outcome: ${outcome}`,
                    },
                });
                const finalJobStatus = ['FULL_REFUND', 'CANCELLED'].includes(outcome) ? 'CANCELLED' : 'CLOSED';
                await tx.job.update({
                    where: { id: dispute.jobId },
                    data: { status: finalJobStatus },
                });
                await tx.jobStatusHistory.create({
                    data: {
                        jobId: dispute.jobId,
                        previousStatus: 'DISPUTED',
                        newStatus: finalJobStatus,
                        changedByUserId: adminId,
                        reason: `Dispute resolved: ${outcome}`,
                    },
                });
                return resolution;
            });
            return res.status(200).json({
                success: true,
                message: `Dispute resolved successfully with outcome: ${outcome}`,
                data: result,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to resolve dispute' },
            });
        }
    }
}
exports.DisputesController = DisputesController;
