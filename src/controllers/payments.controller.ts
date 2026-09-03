import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { config } from '../config';

export class PaymentsController {
  /**
   * POST /api/v1/payments/create-order
   */
  static async createOrder(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { jobId, amount, paymentMethod } = req.body;

      if (!jobId || !amount || Number(amount) <= 0) {
        return res.status(400).json({ success: false, error: { message: 'Valid jobId and positive amount are required.' } });
      }

      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          customer: true,
          professional: true,
        },
      });

      if (!job) {
        return res.status(404).json({ success: false, error: { message: 'Job not found' } });
      }

      if (job.customer.userId !== userId && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
      }

      const orderRef = `order_vaziro_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const payment = await prisma.payment.create({
        data: {
          jobId: job.id,
          amount: Number(amount),
          currency: 'INR',
          status: 'PENDING',
          paymentMethod: paymentMethod || 'UPI',
        },
      });

      await prisma.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          idempotencyKey: `idemp_${payment.id}_${Date.now()}`,
          provider: 'MOCK',
          providerOrderId: orderRef,
          status: 'INITIATED',
        },
      });

      return res.status(201).json({
        success: true,
        message: 'Payment order created. Ready for UPI / NetBanking / Card authorization.',
        data: {
          orderId: orderRef,
          paymentId: payment.id,
          amount: Number(amount),
          currency: 'INR (₹)',
          customerName: `${req.user?.firstName} ${req.user?.lastName}`,
          phone: req.user?.phone,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create payment order' },
      });
    }
  }

  /**
   * POST /api/v1/payments/webhook
   */
  static async handleWebhook(req: Request, res: Response) {
    try {
      const { payload } = req.body;

      if (!payload || !payload.paymentId) {
        return res.status(400).json({ success: false, error: { message: 'Invalid webhook payload structure.' } });
      }

      const { paymentId, providerTransactionId, providerRefId, amount } = payload;
      const refId = providerRefId || providerTransactionId || `tx_${Date.now()}`;

      // Idempotency check
      const existingTx = await prisma.paymentTransaction.findFirst({
        where: { providerRefId: refId },
      });

      if (existingTx) {
        return res.status(200).json({
          success: true,
          message: 'Webhook event already processed (idempotent duplicate ignore).',
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: { job: true },
        });

        if (!payment) throw new Error('Payment not found');

        const p = await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'SECURED' },
        });

        await tx.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            amount: amount ? Number(amount) : payment.amount,
            type: 'CAPTURE',
            providerRefId: refId,
          },
        });

        if (payment.job.paymentProtectionEnabled) {
          await tx.paymentProtection.upsert({
            where: { jobId: payment.jobId },
            update: {
              heldAmount: payment.amount,
              status: 'HELD',
            },
            create: {
              jobId: payment.jobId,
              heldAmount: payment.amount,
              platformFeeAmount: (payment.amount * 6) / 100,
              netProfessionalAmount: payment.amount - (payment.amount * 6) / 100,
              status: 'HELD',
            },
          });
        }

        return p;
      });

      return res.status(200).json({
        success: true,
        message: 'Payment verified and secured.',
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Webhook processing failed' },
      });
    }
  }

  /**
   * POST /api/v1/payments/:jobId/release
   */
  static async releasePayment(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      const userId = req.user?.id;

      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          customer: true,
          professional: true,
          payments: {
            where: { status: { in: ['SECURED', 'COMPLETED'] } },
          },
        },
      });

      if (!job) {
        return res.status(404).json({ success: false, error: { message: 'Job not found' } });
      }

      if (job.customer.userId !== userId && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({ success: false, error: { message: 'Only the customer or platform admin can release payment.' } });
      }

      const totalAmount = job.agreedPrice;

      const settingPlatformFee = await prisma.systemSetting.findUnique({
        where: { key: 'platform_fee_percentage' },
      });
      const platformFeePct = settingPlatformFee ? parseFloat(settingPlatformFee.value) : config.businessRules.platformFeePercentage;

      const platformFee = Math.round((totalAmount * platformFeePct) / 100);
      const gstRate = 18;
      const cgst = Math.round((platformFee * 9) / 100);
      const sgst = Math.round((platformFee * 9) / 100);
      const igst = 0;

      const netPayout = totalAmount - platformFee;

      const result = await prisma.$transaction(async (tx) => {
        const updatedJob = await tx.job.update({
          where: { id: job.id },
          data: { status: 'PAYMENT_RELEASED' },
        });

        await tx.jobStatusHistory.create({
          data: {
            jobId: job.id,
            previousStatus: job.status,
            newStatus: 'PAYMENT_RELEASED',
            changedByUserId: userId,
            reason: `Payment released by customer. Platform fee (6% = ₹${platformFee}) deducted. Net payout: ₹${netPayout}.`,
          },
        });

        const paymentRecord = job.payments[0];
        if (paymentRecord) {
          await tx.paymentFee.create({
            data: {
              paymentId: paymentRecord.id,
              platformFee,
              cgstAmount: cgst,
              sgstAmount: sgst,
              igstAmount: igst,
              totalFee: platformFee + cgst + sgst + igst,
            },
          });
        }

        const payout = await tx.professionalPayout.create({
          data: {
            professionalProfileId: job.professionalProfileId,
            amount: netPayout,
            currency: 'INR',
            payoutMethod: 'IMPS',
            status: 'PENDING',
          },
        });

        const invoiceCount = await tx.invoice.count();
        const invoiceNumber = `VAZ-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(invoiceCount + 1001).padStart(5, '0')}`;

        const invoice = await tx.invoice.create({
          data: {
            jobId: job.id,
            invoiceNumber,
            taxableAmount: platformFee,
            cgstAmount: cgst,
            sgstAmount: sgst,
            igstAmount: igst,
            totalAmount,
            status: 'ISSUED',
            items: {
              create: [
                {
                  description: `Vaziro Marketplace Platform Fee (6%) for Job #${job.id.substring(0, 8)}`,
                  unitPrice: platformFee,
                  quantity: 1,
                  amount: platformFee,
                  taxRate: gstRate,
                },
              ],
            },
          },
        });

        return {
          job: updatedJob,
          payout,
          invoice,
          breakdown: {
            totalAmount,
            platformFee,
            cgst,
            sgst,
            igst,
            netPayout,
          },
        };
      });

      return res.status(200).json({
        success: true,
        message: 'Payment released successfully to service professional.',
        data: result,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to release payment' },
      });
    }
  }

  /**
   * GET /api/v1/payments/invoice/:jobId
   */
  static async getInvoice(req: Request, res: Response) {
    try {
      const { jobId } = req.params;

      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: {
          customer: { include: { user: true } },
          professional: { include: { user: true } },
        },
      });

      if (!job) {
        return res.status(404).json({ success: false, error: { message: 'Job not found' } });
      }

      const invoice = await prisma.invoice.findFirst({
        where: { jobId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: {
          invoice,
          jobSummary: {
            id: job.id,
            finalPrice: job.agreedPrice,
            customerName: `${job.customer.user.firstName} ${job.customer.user.lastName}`,
            professionalName: `${job.professional.user.firstName} ${job.professional.user.lastName}`,
          },
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch invoice' },
      });
    }
  }
}
