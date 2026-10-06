"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportService = void 0;
const prisma_1 = require("../lib/prisma");
class ReportService {
    /**
     * Files a report against a message or conversation
     */
    static async fileReport(reporterUserId, params) {
        const { reportedUserId, conversationId, messageId, reason, description } = params;
        if (reporterUserId === reportedUserId) {
            throw new Error('You cannot report yourself');
        }
        const report = await prisma_1.prisma.conversationReport.create({
            data: {
                reporterUserId,
                reportedUserId,
                chatThreadId: conversationId || null,
                messageId: messageId || null,
                reason: reason.toUpperCase(),
                description: description || null,
                status: 'OPEN',
            },
        });
        return report;
    }
    /**
     * Admin: List reports with filters and pagination
     */
    static async getReports(params) {
        const page = Math.max(1, params.page || 1);
        const limit = Math.min(50, Math.max(1, params.limit || 20));
        const skip = (page - 1) * limit;
        const where = {};
        if (params.status) {
            where.status = params.status;
        }
        const [reports, total] = await Promise.all([
            prisma_1.prisma.conversationReport.findMany({
                where,
                include: {
                    reporter: {
                        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
                    },
                    reportedUser: {
                        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
                    },
                    message: {
                        select: { id: true, content: true, messageType: true, createdAt: true },
                    },
                    chatThread: {
                        select: { id: true, jobId: true, requirementId: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.conversationReport.count({ where }),
        ]);
        return {
            reports,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    /**
     * Admin: Get report by ID
     */
    static async getReportById(reportId) {
        return prisma_1.prisma.conversationReport.findUnique({
            where: { id: reportId },
            include: {
                reporter: {
                    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
                },
                reportedUser: {
                    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
                },
                message: true,
                chatThread: {
                    include: {
                        job: { select: { id: true, status: true, requirement: { select: { title: true } } } },
                    },
                },
            },
        });
    }
    /**
     * Admin: Update report resolution
     */
    static async resolveReport(adminUserId, reportId, params) {
        const report = await prisma_1.prisma.conversationReport.findUnique({ where: { id: reportId } });
        if (!report) {
            throw new Error('Report not found');
        }
        const updated = await prisma_1.prisma.conversationReport.update({
            where: { id: reportId },
            data: {
                status: params.status,
                adminNotes: params.adminNotes || report.adminNotes,
                resolvedByUserId: adminUserId,
                resolvedAt: ['RESOLVED', 'DISMISSED'].includes(params.status) ? new Date() : null,
            },
        });
        // Record audit log
        await prisma_1.prisma.auditLog.create({
            data: {
                userId: adminUserId,
                action: 'COMMUNICATION_REPORT_RESOLVED',
                entityType: 'ConversationReport',
                entityId: reportId,
                metadata: JSON.stringify({
                    status: params.status,
                    adminNotes: params.adminNotes,
                }),
            },
        }).catch(() => { });
        return updated;
    }
}
exports.ReportService = ReportService;
