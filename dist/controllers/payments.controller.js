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
                environment: config_1.config.razorpay.environment || 'test',
            },
        });
    }
    /**
     * POST /api/v1/payments/create-order
     * Creates a Razorpay order with strict server-side amount calculation
     */
    static async createOrder(req, res) {
        try {
            const userId = req.user?.id;
            const { jobId, orderId, planId, paymentMethod } = req.body;
            let payableAmountInInr = 0;
            let orderReceipt = '';
            let orderNotes = {
                userId: userId || '',
                platform: 'vaziro',
            };
            let associatedJobId = null;
            let associatedPlanId = null;
            // Case 1: Job Escrow Payment
            if (jobId) {
                const job = await prisma_1.prisma.job.findUnique({
                    where: { id: jobId },
                    include: { customer: true, professional: true, payments: true },
                });
                if (!job) {
                    return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
                }
                if (job.customer.userId !== userId && !req.user?.roles?.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r))) {
                    return res.status(403).json({ success: false, error: { message: 'Access denied to this job order.' } });
                }
                // Duplicate payment protection: check if already secured or completed
                const existingPaid = job.payments.find((p) => ['SECURED', 'CAPTURED', 'PAID', 'RELEASED'].includes(p.status));
                if (existingPaid) {
                    return res.status(400).json({
                        success: false,
                        error: { code: 'ALREADY_PAID', message: 'Escrow payment has already been secured for this job.' },
                    });
                }
                payableAmountInInr = Number(job.agreedPrice);
                orderReceipt = `job_${job.id.substring(0, 8)}_${Date.now()}`;
                orderNotes.jobId = job.id;
                orderNotes.type = 'JOB_ESCROW_PAYMENT';
                associatedJobId = job.id;
            }
            // Case 2: Professional Credit Plan Purchase
            else if (planId) {
                const plan = await prisma_1.prisma.creditPlan.findUnique({ where: { id: planId } });
                if (!plan || !plan.isActive) {
                    return res.status(404).json({ success: false, error: { message: 'Credit plan not found or inactive.' } });
                }
                payableAmountInInr = Number(plan.price);
                orderReceipt = `cr_${plan.id.substring(0, 8)}_${Date.now()}`;
                orderNotes.planId = plan.id;
                orderNotes.type = 'CREDIT_PURCHASE';
                associatedPlanId = plan.id;
            }
            // Case 3: Generic Order ID
            else if (orderId) {
                const existingPayment = await prisma_1.prisma.payment.findFirst({
                    where: { orderId, status: { in: ['SECURED', 'CAPTURED', 'PAID'] } },
                });
                if (existingPayment) {
                    return res.status(400).json({
                        success: false,
                        error: { code: 'ALREADY_PAID', message: 'Order has already been paid.' },
                    });
                }
                orderReceipt = String(orderId);
                payableAmountInInr = req.body.amount ? Number(req.body.amount) : 500;
                orderNotes.orderId = String(orderId);
            }
            else {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Please specify a valid jobId, planId, or orderId.' },
                });
            }
            if (payableAmountInInr <= 0) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Payable amount must be greater than ₹0.' },
                });
            }
            // Create Razorpay order via API
            const razorpayOrder = await razorpay_service_1.RazorpayService.createOrder(payableAmountInInr, orderReceipt, orderNotes);
            // Create Payment record in DB with status CREATED
            const payment = await prisma_1.prisma.payment.create({
                data: {
                    jobId: associatedJobId,
                    userId: userId || null,
                    orderId: orderReceipt,
                    razorpayOrderId: razorpayOrder.id,
                    amount: payableAmountInInr,
                    currency: 'INR',
                    status: 'CREATED',
                    paymentMethod: paymentMethod || 'RAZORPAY',
                    email: req.user?.email || null,
                    contact: req.user?.phone || null,
                    description: orderNotes.type || 'Vaziro Payment',
                },
            });
            // Log attempt
            await prisma_1.prisma.paymentAttempt.create({
                data: {
                    paymentId: payment.id,
                    idempotencyKey: `idemp_${payment.id}_${Date.now()}`,
                    provider: 'RAZORPAY',
                    providerOrderId: razorpayOrder.id,
                    status: 'INITIATED',
                    rawResponse: JSON.stringify(razorpayOrder),
                },
            });
            return res.status(201).json({
                success: true,
                message: 'Razorpay order created successfully.',
                data: {
                    orderId: razorpayOrder.id,
                    paymentId: payment.id,
                    amount: razorpayOrder.amount, // in paise
                    amountInr: payableAmountInInr,
                    currency: razorpayOrder.currency,
                    keyId: razorpay_service_1.RazorpayService.getKeyId(),
                    customerName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || 'Vaziro Customer',
                    email: req.user?.email || '',
                    phone: req.user?.phone || '',
                    description: orderNotes.type || 'Vaziro Secure Payment',
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
     * POST /api/v1/payments/verify
     * Cryptographically verifies Razorpay signature and confirms payment status server-side
     */
    static async verifyPayment(req, res) {
        try {
            const userId = req.user?.id;
            const razorpayOrderId = req.body.razorpay_order_id || req.body.orderId;
            const razorpayPaymentId = req.body.razorpay_payment_id || req.body.paymentId;
            const razorpaySignature = req.body.razorpay_signature || req.body.signature;
            const jobId = req.body.jobId;
            const planId = req.body.planId;
            if (!razorpayOrderId || !razorpayPaymentId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'razorpay_order_id and razorpay_payment_id are mandatory.' },
                });
            }
            // 1. Mandatory Cryptographic Signature Verification
            const isValid = razorpay_service_1.RazorpayService.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
            if (!isValid) {
                console.warn(`[SECURITY ALERT] Invalid payment signature attempt! Order: ${razorpayOrderId}, Payment: ${razorpayPaymentId}`);
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_SIGNATURE', message: 'Cryptographic payment signature verification failed.' },
                });
            }
            // 2. Fetch Payment record from DB
            let payment = await prisma_1.prisma.payment.findFirst({
                where: {
                    OR: [
                        { razorpayOrderId: razorpayOrderId },
                        ...(jobId ? [{ jobId, status: { in: ['CREATED', 'PENDING'] } }] : []),
                    ],
                },
                include: { job: { include: { customer: true } } },
            });
            // If payment already captured (idempotent duplicate request)
            if (payment && ['CAPTURED', 'SECURED', 'PAID'].includes(payment.status)) {
                return res.status(200).json({
                    success: true,
                    message: 'Payment has already been verified and confirmed.',
                    data: {
                        paymentId: payment.id,
                        razorpayPaymentId: payment.razorpayPaymentId || razorpayPaymentId,
                        orderId: payment.orderId || razorpayOrderId,
                        amount: payment.amount,
                        status: payment.status,
                    },
                });
            }
            // 3. Server-side payment status verification via Razorpay API (captured / authorized)
            const rzpPayment = await razorpay_service_1.RazorpayService.fetchPayment(razorpayPaymentId);
            if (rzpPayment && rzpPayment.status === 'failed') {
                return res.status(400).json({
                    success: false,
                    error: { code: 'PAYMENT_FAILED', message: rzpPayment.error_description || 'Payment failed on Razorpay.' },
                });
            }
            // 4. Atomic database transaction: Update payment status and activate service
            const confirmedPayment = await prisma_1.prisma.$transaction(async (tx) => {
                let currentPayment = payment;
                if (!currentPayment) {
                    currentPayment = await tx.payment.create({
                        data: {
                            jobId: jobId || null,
                            userId: userId || null,
                            orderId: razorpayOrderId,
                            razorpayOrderId,
                            razorpayPaymentId,
                            razorpaySignature,
                            amount: rzpPayment ? rzpPayment.amount / 100 : (jobId ? 5000 : 500),
                            currency: 'INR',
                            status: 'CAPTURED',
                            paymentMethod: rzpPayment?.method || 'UPI',
                            capturedAt: new Date(),
                        },
                    });
                }
                else {
                    currentPayment = await tx.payment.update({
                        where: { id: currentPayment.id },
                        data: {
                            status: 'CAPTURED',
                            razorpayPaymentId,
                            razorpaySignature,
                            paymentMethod: rzpPayment?.method || currentPayment.paymentMethod || 'UPI',
                            capturedAt: new Date(),
                        },
                    });
                }
                if (!currentPayment) {
                    throw new Error('Could not persist payment record.');
                }
                // Log transaction
                await tx.paymentTransaction.create({
                    data: {
                        paymentId: currentPayment.id,
                        amount: currentPayment.amount,
                        type: 'CAPTURE',
                        providerRefId: razorpayPaymentId,
                    },
                });
                // Activation Case A: Job Escrow Protection
                const targetJobId = jobId || currentPayment.jobId;
                if (targetJobId) {
                    const job = await tx.job.findUnique({ where: { id: targetJobId } });
                    if (job) {
                        const platformFee = (currentPayment.amount * 6) / 100;
                        await tx.paymentProtection.upsert({
                            where: { jobId: job.id },
                            update: {
                                heldAmount: currentPayment.amount,
                                status: 'HELD',
                            },
                            create: {
                                jobId: job.id,
                                heldAmount: currentPayment.amount,
                                platformFeeAmount: platformFee,
                                netProfessionalAmount: currentPayment.amount - platformFee,
                                status: 'HELD',
                            },
                        });
                        if (job.status === 'HIRED') {
                            await tx.job.update({
                                where: { id: job.id },
                                data: { status: 'SCHEDULED' },
                            });
                            await tx.jobStatusHistory.create({
                                data: {
                                    jobId: job.id,
                                    previousStatus: 'HIRED',
                                    newStatus: 'SCHEDULED',
                                    changedByUserId: userId || null,
                                    reason: 'Customer completed 100% Escrow funding via Razorpay. Service is scheduled.',
                                },
                            });
                        }
                    }
                }
                // Activation Case B: Professional Credit Purchase
                const targetPlanId = planId || (rzpPayment?.notes?.planId);
                if (targetPlanId && userId) {
                    const prof = await tx.professionalProfile.findUnique({ where: { userId } });
                    if (prof) {
                        const plan = await tx.creditPlan.findUnique({ where: { id: targetPlanId } });
                        if (plan) {
                            await tx.creditWallet.upsert({
                                where: { professionalProfileId: prof.id },
                                update: {
                                    balance: { increment: plan.creditsCount },
                                    lifetimePurchased: { increment: plan.creditsCount },
                                },
                                create: {
                                    professionalProfileId: prof.id,
                                    balance: plan.creditsCount,
                                    lifetimePurchased: plan.creditsCount,
                                },
                            });
                            const updatedWallet = await tx.creditWallet.findUnique({ where: { professionalProfileId: prof.id } });
                            await tx.creditTransaction.create({
                                data: {
                                    creditWalletId: updatedWallet.id,
                                    amount: plan.creditsCount,
                                    transactionType: 'PURCHASE',
                                    referenceEntityId: razorpayPaymentId,
                                    balanceAfter: updatedWallet.balance,
                                    notes: `Razorpay Purchase of ${plan.name} Pack (₹${plan.price})`,
                                },
                            });
                        }
                    }
                }
                return currentPayment;
            });
            return res.status(200).json({
                success: true,
                message: 'Payment verified and service activated successfully.',
                data: {
                    paymentId: confirmedPayment.id,
                    razorpayPaymentId,
                    orderId: confirmedPayment.orderId || razorpayOrderId,
                    amount: confirmedPayment.amount,
                    status: 'CAPTURED',
                    capturedAt: confirmedPayment.capturedAt,
                },
            });
        }
        catch (error) {
            console.error('Payment verification error:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Server error during payment verification.' },
            });
        }
    }
    /**
     * POST /api/v1/payments/webhook & /api/v1/payments/razorpay/webhook
     * Cryptographically verified, idempotent webhook processing
     */
    static async handleWebhook(req, res) {
        try {
            const signature = req.headers['x-razorpay-signature'] || '';
            const rawBody = req.rawBody || JSON.stringify(req.body);
            // 1. Signature Verification
            const isValid = razorpay_service_1.RazorpayService.verifyWebhookSignature(rawBody, signature);
            if (!isValid) {
                console.warn('[SECURITY ALERT] Invalid Razorpay webhook signature received!');
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed.' },
                });
            }
            const event = req.body.event;
            const payload = req.body.payload;
            const eventId = req.headers['x-razorpay-event-id'] || req.body.event_id || `evt_${Date.now()}_${Math.random()}`;
            // 2. Idempotency Check: Prevent duplicate event processing
            const existingEvent = await prisma_1.prisma.webhookEvent.findUnique({
                where: { eventId },
            });
            if (existingEvent && existingEvent.processed) {
                return res.status(200).json({
                    success: true,
                    message: 'Webhook event already processed (idempotent duplicate ignore).',
                });
            }
            // Record webhook event
            if (!existingEvent) {
                await prisma_1.prisma.webhookEvent.create({
                    data: {
                        eventId,
                        eventType: event || 'unknown',
                        payload: typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
                        processed: false,
                    },
                });
            }
            // 3. Process Event Types
            if (event === 'payment.captured' || event === 'order.paid') {
                const paymentEntity = payload?.payment?.entity;
                const orderEntity = payload?.order?.entity;
                const razorpayPaymentId = paymentEntity?.id;
                const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
                const amountInPaise = paymentEntity?.amount || orderEntity?.amount;
                const amountInInr = amountInPaise ? amountInPaise / 100 : 0;
                const method = paymentEntity?.method || 'UPI';
                if (razorpayOrderId) {
                    await prisma_1.prisma.$transaction(async (tx) => {
                        let payment = await tx.payment.findFirst({
                            where: { razorpayOrderId },
                            include: { job: true },
                        });
                        if (!payment) {
                            payment = await tx.payment.create({
                                data: {
                                    orderId: razorpayOrderId,
                                    razorpayOrderId,
                                    razorpayPaymentId,
                                    amount: amountInInr,
                                    currency: 'INR',
                                    status: 'CAPTURED',
                                    paymentMethod: method,
                                    email: paymentEntity?.email || null,
                                    contact: paymentEntity?.contact || null,
                                    capturedAt: new Date(),
                                },
                                include: { job: true },
                            });
                        }
                        else if (payment.status !== 'CAPTURED') {
                            payment = await tx.payment.update({
                                where: { id: payment.id },
                                data: {
                                    status: 'CAPTURED',
                                    razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId,
                                    paymentMethod: method,
                                    capturedAt: new Date(),
                                },
                                include: { job: true },
                            });
                        }
                        // Record transaction
                        if (razorpayPaymentId) {
                            const existingTx = await tx.paymentTransaction.findFirst({
                                where: { providerRefId: razorpayPaymentId },
                            });
                            if (!existingTx) {
                                await tx.paymentTransaction.create({
                                    data: {
                                        paymentId: payment.id,
                                        amount: payment.amount,
                                        type: 'CAPTURE',
                                        providerRefId: razorpayPaymentId,
                                    },
                                });
                            }
                        }
                        // If associated with a Job, lock in escrow
                        if (payment.jobId) {
                            const platformFee = (payment.amount * 6) / 100;
                            await tx.paymentProtection.upsert({
                                where: { jobId: payment.jobId },
                                update: { heldAmount: payment.amount, status: 'HELD' },
                                create: {
                                    jobId: payment.jobId,
                                    heldAmount: payment.amount,
                                    platformFeeAmount: platformFee,
                                    netProfessionalAmount: payment.amount - platformFee,
                                    status: 'HELD',
                                },
                            });
                            await tx.job.updateMany({
                                where: { id: payment.jobId, status: 'HIRED' },
                                data: { status: 'SCHEDULED' },
                            });
                        }
                    });
                }
            }
            else if (event === 'payment.failed') {
                const paymentEntity = payload?.payment?.entity;
                const razorpayOrderId = paymentEntity?.order_id;
                const razorpayPaymentId = paymentEntity?.id;
                if (razorpayOrderId) {
                    await prisma_1.prisma.payment.updateMany({
                        where: { razorpayOrderId },
                        data: {
                            status: 'FAILED',
                            razorpayPaymentId,
                            failureCode: paymentEntity?.error_code || 'PAYMENT_FAILED',
                            failureReason: paymentEntity?.error_description || 'Payment failed',
                        },
                    });
                }
            }
            // 4. Mark webhook event as processed
            await prisma_1.prisma.webhookEvent.update({
                where: { eventId },
                data: {
                    processed: true,
                    processedAt: new Date(),
                },
            });
            return res.status(200).json({
                success: true,
                message: 'Webhook processed successfully.',
            });
        }
        catch (error) {
            console.error('Webhook handling error:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Webhook processing failed.' },
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
    /**
     * GET /api/v1/payments/transactions
     * Admin transaction ledger with search, filtering, and pagination
     */
    static async getTransactions(req, res) {
        try {
            const { search, status, page = '1', limit = '20' } = req.query;
            const pageNum = Math.max(1, parseInt(page, 10));
            const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
            const skip = (pageNum - 1) * limitNum;
            const whereClause = {};
            if (status && status !== 'ALL') {
                whereClause.status = status;
            }
            if (search) {
                const term = String(search).trim();
                whereClause.OR = [
                    { orderId: { contains: term } },
                    { razorpayOrderId: { contains: term } },
                    { razorpayPaymentId: { contains: term } },
                    { email: { contains: term } },
                    { contact: { contains: term } },
                    { user: { firstName: { contains: term } } },
                    { user: { lastName: { contains: term } } },
                ];
            }
            const [total, payments] = await Promise.all([
                prisma_1.prisma.payment.count({ where: whereClause }),
                prisma_1.prisma.payment.findMany({
                    where: whereClause,
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
                        job: { select: { id: true, status: true, agreedPrice: true } },
                        transactions: true,
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limitNum,
                }),
            ]);
            return res.status(200).json({
                success: true,
                data: {
                    payments,
                    pagination: {
                        total,
                        page: pageNum,
                        limit: limitNum,
                        pages: Math.ceil(total / limitNum),
                    },
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch payment transactions.' },
            });
        }
    }
}
exports.PaymentsController = PaymentsController;
