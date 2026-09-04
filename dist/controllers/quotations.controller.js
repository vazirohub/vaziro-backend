"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotationsController = void 0;
const prisma_1 = require("../lib/prisma");
const credit_service_1 = require("../services/credit.service");
const ai_match_service_1 = require("../services/ai-match.service");
const notification_service_1 = require("../services/notification.service");
class QuotationsController {
    /**
     * POST /api/v1/quotations/apply
     */
    static async submitQuotation(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { requirementId, proposedPrice, timeline, estimatedTimeline, proposedStartDate, message, scope, scopeSummary, additionalCharges, milestones, } = req.body;
            const effectiveTimeline = estimatedTimeline || timeline;
            const effectiveScope = scopeSummary || scope;
            if (!requirementId || !proposedPrice || !effectiveTimeline || !message) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'requirementId, proposedPrice, timeline, and message are mandatory.' },
                });
            }
            const prof = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
                include: { user: true },
            });
            if (!prof) {
                return res.status(403).json({
                    success: false,
                    error: { message: 'Only registered professionals can submit quotations.' },
                });
            }
            const requirement = await prisma_1.prisma.requirement.findUnique({
                where: { id: requirementId },
                include: { customer: true },
            });
            if (!requirement || !['PUBLISHED', 'RECEIVING_QUOTES'].includes(requirement.status)) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'This requirement is no longer accepting new quotations.' },
                });
            }
            const existingApplication = await prisma_1.prisma.application.findUnique({
                where: {
                    requirementId_professionalProfileId: {
                        requirementId,
                        professionalProfileId: prof.id,
                    },
                },
            });
            if (existingApplication) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'You have already submitted an application for this requirement.' },
                });
            }
            const creditCost = await credit_service_1.CreditService.calculateFee(requirement.budgetMin, requirement.budgetMax);
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                // 1. Atomic credit deduction inside the transaction
                const deduction = await credit_service_1.CreditService.deductCreditsForApplication(prof.id, requirement.id, creditCost, tx);
                // 2. Create application with immutable snapshot of fee terms (Section 15, 20)
                const application = await tx.application.create({
                    data: {
                        requirementId: requirement.id,
                        professionalProfileId: prof.id,
                        creditsSpent: creditCost,
                        customerBudgetAtApplication: requirement.budgetMin,
                        creditPercentageAtApplication: 10.0,
                        creditValueAtApplication: 10.0,
                        creditsCharged: creditCost,
                        batchAllocation: JSON.stringify(deduction.batchAllocations),
                        status: 'SUBMITTED',
                    },
                });
                if (deduction.ledgerEntry?.id) {
                    await tx.creditLedger.update({
                        where: { id: deduction.ledgerEntry.id },
                        data: { applicationId: application.id },
                    });
                }
                // 3. Create quotation linked to application
                const quotation = await tx.quotation.create({
                    data: {
                        applicationId: application.id,
                        requirementId: requirement.id,
                        professionalProfileId: prof.id,
                        proposedPrice: Number(proposedPrice),
                        currency: 'INR',
                        estimatedTimeline: String(effectiveTimeline),
                        proposedStartDate: proposedStartDate ? new Date(proposedStartDate) : null,
                        message,
                        scopeSummary: effectiveScope || null,
                        additionalCharges: additionalCharges ? Number(additionalCharges) : 0,
                        status: 'SUBMITTED',
                        milestones: milestones && Array.isArray(milestones) && milestones.length > 0 ? {
                            create: milestones.map((m, idx) => ({
                                title: m.title || `Milestone ${idx + 1}`,
                                description: m.description || '',
                                amount: Number(m.amount),
                                dueDate: m.dueDate ? new Date(m.dueDate) : null,
                                status: 'PENDING',
                            })),
                        } : undefined,
                    },
                    include: {
                        milestones: true,
                    },
                });
                return {
                    quotation,
                    application,
                    creditsDeducted: creditCost,
                    remainingBalance: deduction.balanceRemaining,
                };
            });
            // Asynchronously send notifications
            if (requirement.customer?.userId) {
                notification_service_1.NotificationService.sendQuotationReceived({
                    customerUserId: requirement.customer.userId,
                    requirementTitle: requirement.title,
                    quotationAmount: Number(proposedPrice),
                    professionalName: `${prof.user.firstName} ${prof.user.lastName}`.trim(),
                    requirementId: requirement.id,
                }).catch(() => { });
            }
            notification_service_1.NotificationService.sendApplicationSubmitted({
                professionalUserId: prof.userId,
                requirementTitle: requirement.title,
                creditsSpent: result.creditsDeducted,
                requirementId: requirement.id,
            }).catch(() => { });
            return res.status(201).json({
                success: true,
                message: `Quotation submitted successfully. ${result.creditsDeducted} credits deducted.`,
                data: result,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to submit quotation' },
            });
        }
    }
    /**
     * GET /api/v1/quotations/requirement/:requirementId
     */
    static async getQuotationsForRequirement(req, res) {
        try {
            const { requirementId } = req.params;
            const requirement = await prisma_1.prisma.requirement.findUnique({
                where: { id: requirementId },
                include: {
                    category: true,
                    subcategory: true,
                    city: true,
                },
            });
            if (!requirement) {
                return res.status(404).json({ success: false, error: { message: 'Requirement not found' } });
            }
            const quotations = await prisma_1.prisma.quotation.findMany({
                where: { requirementId },
                include: {
                    professional: {
                        include: {
                            user: {
                                select: {
                                    firstName: true,
                                    lastName: true,
                                    createdAt: true,
                                },
                            },
                            verification: true,
                            skills: {
                                include: { skill: true },
                            },
                        },
                    },
                    milestones: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            const enriched = quotations.map((q) => {
                const matchResult = ai_match_service_1.AIMatchService.calculateMatchScore(requirement, q.professional);
                return {
                    ...q,
                    timeline: q.estimatedTimeline,
                    aiMatch: matchResult,
                };
            });
            return res.status(200).json({
                success: true,
                data: enriched,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch quotations' },
            });
        }
    }
    /**
     * PATCH /api/v1/quotations/:id/shortlist
     */
    static async shortlistQuotation(req, res) {
        try {
            const { id } = req.params;
            const quotation = await prisma_1.prisma.quotation.update({
                where: { id },
                data: { status: 'SHORTLISTED' },
            });
            return res.status(200).json({
                success: true,
                message: 'Quotation shortlisted',
                data: quotation,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to shortlist quotation' },
            });
        }
    }
    /**
     * PATCH /api/v1/quotations/:id/reject
     */
    static async rejectQuotation(req, res) {
        try {
            const { id } = req.params;
            const quotation = await prisma_1.prisma.quotation.update({
                where: { id },
                data: { status: 'REJECTED' },
            });
            return res.status(200).json({
                success: true,
                message: 'Quotation rejected',
                data: quotation,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to reject quotation' },
            });
        }
    }
    /**
     * GET /api/v1/quotations/my
     */
    static async getMyQuotations(req, res) {
        try {
            const userId = req.user?.id;
            const prof = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
            });
            if (!prof) {
                return res.status(200).json({ success: true, data: [] });
            }
            const quotations = await prisma_1.prisma.quotation.findMany({
                where: { professionalProfileId: prof.id },
                include: {
                    requirement: {
                        include: { category: true, city: true },
                    },
                    milestones: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            return res.status(200).json({
                success: true,
                data: quotations.map((q) => ({
                    ...q,
                    timeline: q.estimatedTimeline,
                })),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch professional quotations' },
            });
        }
    }
}
exports.QuotationsController = QuotationsController;
