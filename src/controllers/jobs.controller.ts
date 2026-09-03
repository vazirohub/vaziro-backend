import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

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
            paymentProtectionEnabled: Boolean(usePaymentProtection),
          },
        });

        // 5. Record initial JobStatusHistory
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
        };
      });

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
