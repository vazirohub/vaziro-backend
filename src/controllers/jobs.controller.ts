import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { CreditService } from '../services/credit.service';
import { NotificationService } from '../services/notification.service';

// Controlled status transition map
const VALID_TRANSITIONS: Record<string, string[]> = {
  HIRED: ['SCHEDULED', 'CANCELLED', 'DISPUTED'],
  SCHEDULED: ['PREPARING', 'ON_THE_WAY', 'CANCELLED', 'DISPUTED'],
  PREPARING: ['ON_THE_WAY', 'CANCELLED', 'DISPUTED'],
  ON_THE_WAY: ['ARRIVED', 'DISPUTED'],
  ARRIVED: ['SERVICE_STARTED', 'DISPUTED'],
  SERVICE_STARTED: ['SERVICE_COMPLETED', 'DISPUTED'],
  SERVICE_COMPLETED: ['CUSTOMER_APPROVED', 'DISPUTED'],
  CUSTOMER_APPROVED: ['PAYMENT_RELEASED', 'CLOSED', 'DISPUTED'],
  PAYMENT_RELEASED: ['CLOSED'],
  DISPUTED: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'CLOSED', 'CANCELLED'],
  CANCELLED: [],
  CLOSED: [],
};

export class JobsController {
  /**
   * POST /api/v1/jobs/hire
   */
  static async hire(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { quotationId, usePaymentProtection } = req.body;

      if (!quotationId) {
        return res.status(400).json({ success: false, error: { message: 'quotationId is required.' } });
      }

      const customer = await prisma.customerProfile.findUnique({
        where: { userId },
        include: { user: true },
      });

      if (!customer) {
        return res.status(403).json({ success: false, error: { message: 'Only registered customers can hire.' } });
      }

      const job = await prisma.$transaction(async (tx) => {
        const quotation = await tx.quotation.findUnique({
          where: { id: quotationId },
          include: {
            requirement: true,
            professional: {
              include: { user: true },
            },
          },
        });

        if (!quotation) {
          throw new Error('Quotation not found.');
        }

        if (quotation.requirement.customerId !== customer.id) {
          throw new Error('You do not own this requirement.');
        }

        if (quotation.requirement.status === 'HIRED' || quotation.requirement.status === 'COMPLETED') {
          throw new Error('This requirement has already been assigned to a hired professional.');
        }

        // 1. Update Requirement status to HIRED
        await tx.requirement.update({
          where: { id: quotation.requirementId },
          data: { status: 'HIRED' },
        });

        // 2. Mark this quote ACCEPTED
        await tx.quotation.update({
          where: { id: quotation.id },
          data: { status: 'ACCEPTED' },
        });

        // 3. Mark all competing quotations REJECTED
        await tx.quotation.updateMany({
          where: {
            requirementId: quotation.requirementId,
            id: { not: quotation.id },
          },
          data: { status: 'REJECTED' },
        });

        // 4. Create Job
        const newJob = await tx.job.create({
          data: {
            requirementId: quotation.requirementId,
            customerId: customer.id,
            professionalProfileId: quotation.professionalProfileId,
            quotationId: quotation.id,
            agreedPrice: quotation.proposedPrice,
            currency: 'INR',
            scheduledStartTime: quotation.proposedStartDate || new Date(),
            status: 'HIRED',
            workStatus: 'PREPARING',
            paymentStatus: usePaymentProtection ? 'PAYMENT_PENDING' : 'NOT_REQUIRED',
            paymentProtectionEnabled: Boolean(usePaymentProtection),
          },
        });

        // 5. Mark hired application HIRED
        if (quotation.applicationId) {
          await tx.application.update({
            where: { id: quotation.applicationId },
            data: { status: 'HIRED' },
          });
        }

        // 6. Automatically refund all other non-hired applicants (Sections 4, 6, 11)
        await CreditService.refundNonHiredApplicants(
          quotation.requirementId,
          quotation.professionalProfileId,
          tx
        );

        // 7. Record initial JobStatusHistory
        await tx.jobStatusHistory.create({
          data: {
            jobId: newJob.id,
            previousStatus: 'NEW',
            newStatus: 'HIRED',
            changedByUserId: userId,
            reason: `Hired by customer with ${usePaymentProtection ? 'Vaziro Payment Protection enabled' : 'Direct payment'}.`,
          },
        });

        // 6. Create Chat Thread between customer and professional
        const thread = await tx.chatThread.create({
          data: {
            jobId: newJob.id,
            requirementId: quotation.requirementId,
            participants: {
              create: [
                { userId: customer.userId },
                { userId: quotation.professional.userId },
              ],
            },
          },
        });

        // Initial welcome message in chat
        await tx.message.create({
          data: {
            chatThreadId: thread.id,
            senderUserId: userId!,
            content: `Hi! I have accepted your quotation for "${quotation.requirement.title}". Let's discuss the schedule and details.`,
          },
        });

        return {
          ...newJob,
          chatThreadId: thread.id,
          quotationTitle: quotation.requirement.title,
          quotationAmount: Number(quotation.proposedPrice),
          professionalUserId: quotation.professional.userId,
          professionalName: `${quotation.professional.user.firstName} ${quotation.professional.user.lastName}`.trim(),
          customerName: `${customer.user?.firstName || 'Customer'} ${customer.user?.lastName || ''}`.trim(),
        };
      });

      NotificationService.sendHireConfirmed({
        customerUserId: userId!,
        professionalUserId: job.professionalUserId,
        requirementTitle: job.quotationTitle,
        quotationAmount: job.quotationAmount,
        professionalName: job.professionalName,
        customerName: job.customerName,
        jobId: job.id,
        paymentSecured: Boolean(usePaymentProtection),
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        message: 'Professional hired successfully! Communication channel is now open.',
        data: job,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'Failed to complete hiring transaction' },
      });
    }
  }

  /**
   * PATCH /api/v1/jobs/:id/status
   */
  static async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { newStatus, notes, reason } = req.body;
      const userId = req.user?.id;

      if (!newStatus) {
        return res.status(400).json({ success: false, error: { message: 'newStatus is required.' } });
      }

      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          customer: true,
          professional: true,
        },
      });

      if (!job) {
        return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
      }

      const isCustomer = job.customer.userId === userId;
      const isProf = job.professional.userId === userId;
      const isAdmin = req.user?.roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));

      if (!isCustomer && !isProf && !isAdmin) {
        return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
      }

      const allowedNextStatuses = VALID_TRANSITIONS[job.status] || [];
      if (!allowedNextStatuses.includes(newStatus) && !isAdmin) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: `Cannot transition from '${job.status}' to '${newStatus}'. Allowed: ${allowedNextStatuses.join(', ')}`,
          },
        });
      }

      const updatedJob = await prisma.$transaction(async (tx) => {
        const uJob = await tx.job.update({
          where: { id },
          data: {
            status: newStatus,
            actualStartTime: newStatus === 'SERVICE_STARTED' ? new Date() : undefined,
            actualEndTime: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED'].includes(newStatus) ? new Date() : undefined,
          },
        });

        await tx.jobStatusHistory.create({
          data: {
            jobId: id,
            previousStatus: job.status,
            newStatus,
            changedByUserId: userId,
            reason: reason || notes || `Status advanced to ${newStatus}`,
          },
        });

        if (newStatus === 'CUSTOMER_APPROVED') {
          await tx.customerProfile.update({
            where: { id: job.customerId },
            data: { jobsCompletedCount: { increment: 1 } },
          });

          await tx.professionalProfile.update({
            where: { id: job.professionalProfileId },
            data: { completedJobsCount: { increment: 1 } },
          });
        }

        return uJob;
      });

      return res.status(200).json({
        success: true,
        message: `Job status updated to ${newStatus}`,
        data: updatedJob,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update job status' },
      });
    }
  }

  /**
   * PATCH /api/v1/jobs/:id/work-status (Section 12, 21, 22)
   * Only the hired Professional can update operational work progress.
   */
  static async updateWorkStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { workStatus, notes } = req.body;
      const userId = req.user?.id;

      if (!workStatus) {
        return res.status(400).json({ success: false, error: { message: 'workStatus is required.' } });
      }

      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          professional: { include: { user: true } },
          customer: { include: { user: true } },
          requirement: true,
        },
      });

      if (!job) {
        return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
      }

      // STRICT PERMISSION: Only the hired professional (or admin) can update work status
      const isHiredProf = job.professional.userId === userId;
      const isAdmin = req.user?.roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));

      if (!isHiredProf && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: { message: 'Forbidden: Only the hired service professional can update operational work status.' },
        });
      }

      const allowedWorkStatuses = ['PREPARING', 'ON_THE_WAY', 'WORK_STARTED', 'WORK_COMPLETED'];
      if (!allowedWorkStatuses.includes(workStatus)) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid work status. Allowed: ${allowedWorkStatuses.join(', ')}` },
        });
      }

      const updatedJob = await prisma.$transaction(async (tx) => {
        const u = await tx.job.update({
          where: { id },
          data: {
            workStatus,
            status: workStatus === 'WORK_COMPLETED' ? 'WORK_COMPLETED' : 'IN_PROGRESS',
            actualStartTime: workStatus === 'WORK_STARTED' ? new Date() : job.actualStartTime,
            actualEndTime: workStatus === 'WORK_COMPLETED' ? new Date() : job.actualEndTime,
          },
        });

        await tx.jobStatusHistory.create({
          data: {
            jobId: id,
            previousStatus: job.workStatus || job.status,
            newStatus: workStatus,
            changedByUserId: userId,
            reason: notes || `Professional updated operational work status to ${workStatus}`,
          },
        });

        return u;
      });

      NotificationService.sendWorkStatusUpdate({
        customerUserId: job.customer.userId,
        requirementTitle: job.requirement?.title || 'Service Request',
        workStatus,
        professionalName: `${job.professional.user.firstName} ${job.professional.user.lastName}`,
        jobId: job.id,
      }).catch(() => {});

      if (workStatus === 'WORK_COMPLETED') {
        NotificationService.sendWorkCompletedConfirmation({
          customerUserId: job.customer.userId,
          requirementTitle: job.requirement?.title || 'Service Request',
          professionalName: `${job.professional.user.firstName} ${job.professional.user.lastName}`,
          jobId: job.id,
        }).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        message: `Work status updated to ${workStatus}.`,
        data: updatedJob,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update work status.' },
      });
    }
  }

  /**
   * POST /api/v1/jobs/:id/confirm-completion (Section 14, 15, 21, 22)
   * Only the Customer can confirm final work completion and authorize payment release.
   */
  static async confirmCompletion(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const job = await prisma.job.findUnique({
        where: { id },
        include: { customer: true, professional: true, requirement: true },
      });

      if (!job) {
        return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
      }

      // STRICT PERMISSION: Only the Customer who owns this job (or admin) can confirm completion
      const isCustomer = job.customer.userId === userId;
      const isAdmin = req.user?.roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));

      if (!isCustomer && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: { message: 'Forbidden: Only the customer who posted the requirement can confirm final work completion.' },
        });
      }

      if (
        job.workStatus !== 'WORK_COMPLETED' &&
        job.status !== 'WORK_COMPLETED' &&
        job.status !== 'SERVICE_COMPLETED'
      ) {
        return res.status(400).json({
          success: false,
          error: { message: 'Cannot confirm completion before the professional has marked work as completed.' },
        });
      }

      const updatedJob = await prisma.$transaction(async (tx) => {
        const u = await tx.job.update({
          where: { id },
          data: {
            status: 'CUSTOMER_CONFIRMED',
            paymentStatus: 'READY_FOR_RELEASE',
            customerConfirmedAt: new Date(),
          },
        });

        await tx.jobStatusHistory.create({
          data: {
            jobId: id,
            previousStatus: job.status,
            newStatus: 'CUSTOMER_CONFIRMED',
            changedByUserId: userId,
            reason: 'Customer confirmed work completion. Payment authorized and ready for release.',
          },
        });

        // Increment customer and professional completed counts
        await tx.customerProfile.update({
          where: { id: job.customerId },
          data: { jobsCompletedCount: { increment: 1 } },
        });

        await tx.professionalProfile.update({
          where: { id: job.professionalProfileId },
          data: { completedJobsCount: { increment: 1 } },
        });

        return u;
      });

      NotificationService.send({
        userId: job.professional.userId,
        type: 'JOB_STATUS',
        title: 'Work Completion Confirmed',
        message: `Customer confirmed work completion for "${job.requirement?.title || 'Service Contract'}". Payment has been authorized and is ready for release.`,
        actionUrl: `/jobs/${job.id}`,
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'Work completion confirmed successfully. Payment is now ready for release.',
        data: updatedJob,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to confirm work completion.' },
      });
    }
  }

  /**
   * POST /api/v1/jobs/:id/dispute (Section 20)
   * If customer reports issue: hold payment and transition to DISPUTED.
   */
  static async raiseDispute(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason, description } = req.body;
      const userId = req.user?.id;

      if (!description) {
        return res.status(400).json({ success: false, error: { message: 'Description of dispute issue is required.' } });
      }

      const job = await prisma.job.findUnique({
        where: { id },
        include: { customer: true, professional: true },
      });

      if (!job) {
        return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
      }

      const isCustomer = job.customer.userId === userId;
      const isProf = job.professional.userId === userId;
      const isAdmin = req.user?.roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));

      if (!isCustomer && !isProf && !isAdmin) {
        return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
      }

      const effectiveReason = reason || 'Work Not Completed / Issue Reported';

      const updatedJob = await prisma.$transaction(async (tx) => {
        const u = await tx.job.update({
          where: { id },
          data: {
            status: 'DISPUTED',
            paymentStatus: 'DISPUTED',
            disputeReason: `${effectiveReason}: ${description}`,
            disputedAt: new Date(),
            disputeStatus: 'OPEN',
          },
        });

        await tx.dispute.create({
          data: {
            jobId: id,
            raisedByUserId: userId!,
            reason: `${effectiveReason}: ${description}`,
            amountDisputed: job.agreedPrice,
            status: 'OPEN',
          },
        });

        await tx.jobStatusHistory.create({
          data: {
            jobId: id,
            previousStatus: job.status,
            newStatus: 'DISPUTED',
            changedByUserId: userId,
            reason: `Dispute raised: ${effectiveReason}`,
          },
        });

        return u;
      });

      return res.status(200).json({
        success: true,
        message: 'Dispute submitted. Payment has been placed on hold pending review.',
        data: updatedJob,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to raise dispute.' },
      });
    }
  }

  /**
   * GET /api/v1/jobs/:id
   */
  static async getJobDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          requirement: {
            include: { category: true, subcategory: true, city: true },
          },
          quotation: {
            include: { milestones: true },
          },
          customer: {
            include: {
              user: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
          professional: {
            include: {
              user: { select: { firstName: true, lastName: true, phone: true } },
              verification: true,
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
          chatThread: true,
          payments: true,
          review: true,
        },
      });

      if (!job) {
        return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
      }

      return res.status(200).json({
        success: true,
        data: {
          ...job,
          finalPrice: job.agreedPrice,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch job details' },
      });
    }
  }

  /**
   * GET /api/v1/jobs
   */
  static async getMyJobs(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const roles = req.user?.roles || [];

      let whereClause: any = {};

      if (roles.includes('CUSTOMER')) {
        const customer = await prisma.customerProfile.findUnique({ where: { userId } });
        if (customer) whereClause.customerId = customer.id;
      } else if (roles.includes('PROFESSIONAL')) {
        const prof = await prisma.professionalProfile.findUnique({ where: { userId } });
        if (prof) whereClause.professionalProfileId = prof.id;
      }

      const jobs = await prisma.job.findMany({
        where: whereClause,
        include: {
          requirement: {
            include: { category: true, city: true },
          },
          quotation: true,
          professional: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
          customer: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: jobs.map((j) => ({
          ...j,
          finalPrice: j.agreedPrice,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to retrieve jobs' },
      });
    }
  }
}
