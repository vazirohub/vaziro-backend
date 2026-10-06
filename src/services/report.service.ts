import { prisma } from '../lib/prisma';

export class ReportService {
  /**
   * Files a report against a message or conversation
   */
  public static async fileReport(
    reporterUserId: string,
    params: {
      reportedUserId: string;
      conversationId?: string;
      messageId?: string;
      reason: string;
      description?: string;
    }
  ) {
    const { reportedUserId, conversationId, messageId, reason, description } = params;

    if (reporterUserId === reportedUserId) {
      throw new Error('You cannot report yourself');
    }

    const report = await prisma.conversationReport.create({
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
  public static async getReports(params: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) {
      where.status = params.status;
    }

    const [reports, total] = await Promise.all([
      prisma.conversationReport.findMany({
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
      prisma.conversationReport.count({ where }),
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
  public static async getReportById(reportId: string) {
    return prisma.conversationReport.findUnique({
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
  public static async resolveReport(
    adminUserId: string,
    reportId: string,
    params: { status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED'; adminNotes?: string }
  ) {
    const report = await prisma.conversationReport.findUnique({ where: { id: reportId } });
    if (!report) {
      throw new Error('Report not found');
    }

    const updated = await prisma.conversationReport.update({
      where: { id: reportId },
      data: {
        status: params.status,
        adminNotes: params.adminNotes || report.adminNotes,
        resolvedByUserId: adminUserId,
        resolvedAt: ['RESOLVED', 'DISMISSED'].includes(params.status) ? new Date() : null,
      },
    });

    // Record audit log
    await prisma.auditLog.create({
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
    }).catch(() => {});

    return updated;
  }
}
