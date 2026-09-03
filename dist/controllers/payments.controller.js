"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
const razorpay_service_1 = require("../services/razorpay.service");
class PaymentsController {
    /**
     * GET /api/v1/payments/config
     * Returns public Razorpay key ID for client checkout
     */
    static async getConfig(req, res) {
        return res.status(200).json({
            success: true,
            data: {
                keyId: razorpay_service_1.RazorpayService.getKeyId(),
                currency: 'INR',
            },
        });
    }
    /**
     * POST /api/v1/payments/create-order
     * Creates a Razorpay order for securing job escrow funds
     */
    static async createOrder(req, res) {
        try {
            const userId = req.user?.id;
            const { jobId, amount, paymentMethod } = req.body;
            if (!jobId || !amount || Number(amount) <= 0) {
                return res.status(400).json({ success: false, error: { message: 'Valid jobId and positive amount are required.' } });
            }
            const job = await prisma_1.prisma.job.findUnique({
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
            const receipt = `job_${job.id.substring(0, 8)}_${Date.now()}`;
            const razorpayOrder = await razorpay_service_1.RazorpayService.createOrder(Number(amount), receipt, {
                jobId: job.id,
                userId: userId || '',
                type: 'JOB_ESCROW_PAYMENT',
            });
            const payment = await prisma_1.prisma.payment.create({
                data: {
                    jobId: job.id,
                    amount: Number(amount),
                    currency: 'INR',
                    status: 'PENDING',
                    paymentMethod: paymentMethod || 'RAZORPAY',
                },
            });
            await prisma_1.prisma.paymentAttempt.create({
                data: {
                    paymentId: payment.id,
                    idempotencyKey: `idemp_${payment.id}_${Date.now()}`,
                    provider: 'RAZORPAY',
                    providerOrderId: razorpayOrder.id,
                    status: 'INITIATED',
                },
            });
            return res.status(201).json({
                success: true,
                message: 'Payment order created. Ready for Razorpay UPI / NetBanking / Card authorization.',
                data: {
                    orderId: razorpayOrder.id,
                    paymentId: payment.id,
                    amount: razorpayOrder.amount, // in paise
                    amountInr: Number(amount),
                    currency: razorpayOrder.currency,
                    keyId: razorpay_service_1.RazorpayService.getKeyId(),
                    customerName: `${req.user?.firstName} ${req.user?.lastName}`.trim(),
                    email: req.user?.email || '',
                    phone: req.user?.phone || '',
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to create payment order' },
            });
        }
    }
    /**
     * POST /api/v1/payments/verify-payment
     * Verifies Razorpay payment signature and secures job funds in escrow
     */
    static async verifyPayment(req, res) {
        try {
            const userId = req.user?.id;
            const { orderId, paymentId, signature, jobId, internalPaymentId } = req.body;
            if (!orderId || !paymentId || !jobId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'orderId, paymentId, and jobId are required.' },
                });
            }
            const isValid = razorpay_service_1.RazorpayService.verifyPaymentSignature(orderId, paymentId, signature);
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_SIGNATURE', message: 'Cryptographic payment verification failed.' },
                });
            }
            const job = await prisma_1.prisma.job.findUnique({
                where: { id: jobId },
                include: { customer: true },
            });
            if (!job) {
                return res.status(404).json({ success: false, error: { message: 'Job not found' } });
            }
            if (job.customer.userId !== userId && !req.user?.roles.includes('ADMIN')) {
                return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
            }
            // Secure payment and update escrow in single transaction
            const updated = await prisma_1.prisma.$transaction(async (tx) => {
                let payment = null;
                if (internalPaymentId) {
                    payment = await tx.payment.findUnique({ where: { id: internalPaymentId } });
                }
                if (!payment) {
                    payment = await tx.payment.findFirst({
                        where: { jobId: job.id, status: 'PENDING' },
                        orderBy: { createdAt: 'desc' },
                    });
                }
                if (!payment) {
                    payment = await tx.payment.create({
                        data: {
                            jobId: job.id,
                            amount: job.agreedPrice,
                            currency: 'INR',
                            status: 'SECURED',
                            paymentMethod: 'RAZORPAY',
                        },
                    });
                }
                else {
                    payment = await tx.payment.update({
                        where: { id: payment.id },
                        data: { status: 'SECURED', paymentMethod: 'RAZORPAY' },
                    });
                }
                await tx.paymentTransaction.create({
                    data: {
                        paymentId: payment.id,
                        amount: payment.amount,
                        type: 'CAPTURE',
                        providerRefId: paymentId,
                    },
                });
                // Lock funds in escrow
                const platformFee = (payment.amount * 6) / 100;
                await tx.paymentProtection.upsert({
                    where: { jobId: job.id },
                    update: {
                        heldAmount: payment.amount,
                        status: 'HELD',
                    },
                    create: {
                        jobId: job.id,
                        heldAmount: payment.amount,
                        platformFeeAmount: platformFee,
                        netProfessionalAmount: payment.amount - platformFee,
                        status: 'HELD',
                    },
                });
                // Ensure job is in active execution lifecycle
                if (job.status === 'HIRED') {
                    await tx.job.update({
                        where: { id: job.id },
                        data: { status: 'SCHEDULED' },
                    });
                }
                return payment;
            });
            return res.status(200).json({
                success: true,
                message: 'Payment verified and secured under Vaziro Escrow Protection.',
                data: updated,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Payment verification failed' },
            });
        }
    }
    /**
     * POST /api/v1/payments/webhook
     */
    static async handleWebhook(req, res) {
        try {
            const { payload } = req.body;
            if (!payload || !payload.paymentId) {
                return res.status(400).json({ success: false, error: { message: 'Invalid webhook payload structure.' } });
            }
            const { paymentId, providerTransactionId, providerRefId, amount } = payload;
            const refId = providerRefId || providerTransactionId || `tx_${Date.now()}`;
            // Idempotency check
            const existingTx = await prisma_1.prisma.paymentTransaction.findFirst({
                where: { providerRefId: refId },
            });
            if (existingTx) {
                return res.status(200).json({
                    success: true,
                    message: 'Webhook event already processed (idempotent duplicate ignore).',
                });
            }
            const updated = await prisma_1.prisma.$transaction(async (tx) => {
                const payment = await tx.payment.findUnique({
                    where: { id: paymentId },
                    include: { job: true },
                });
                if (!payment)
                    throw new Error('Payment not found');
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Webhook processing failed' },
            });
        }
    }
    /**
     * POST /api/v1/payments/:jobId/release
     */
    static async releasePayment(req, res) {
        try {
            const { jobId } = req.params;
            const userId = req.user?.id;
            const job = await prisma_1.prisma.job.findUnique({
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
            const settingPlatformFee = await prisma_1.prisma.systemSetting.findUnique({
                where: { key: 'platform_fee_percentage' },
            });
            const platformFeePct = settingPlatformFee ? parseFloat(settingPlatformFee.value) : config_1.config.businessRules.platformFeePercentage;
            const platformFee = Math.round((totalAmount * platformFeePct) / 100);
            const gstRate = 18;
            const cgst = Math.round((platformFee * 9) / 100);
            const sgst = Math.round((platformFee * 9) / 100);
            const igst = 0;
            const netPayout = totalAmount - platformFee;
            const result = await prisma_1.prisma.$transaction(async (tx) => {
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to release payment' },
            });
        }
    }
    /**
     * GET /api/v1/payments/invoice/:jobId
     */
    static async getInvoice(req, res) {
        try {
            const { jobId } = req.params;
            const job = await prisma_1.prisma.job.findUnique({
                where: { id: jobId },
                include: {
                    customer: { include: { user: true } },
                    professional: { include: { user: true } },
                },
            });
            if (!job) {
                return res.status(404).json({ success: false, error: { message: 'Job not found' } });
            }
            const invoice = await prisma_1.prisma.invoice.findFirst({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch invoice' },
            });
        }
    }
}
exports.PaymentsController = PaymentsController;
