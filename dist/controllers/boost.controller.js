"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoostController = void 0;
const prisma_1 = require("../lib/prisma");
const razorpay_service_1 = require("../services/razorpay.service");
class BoostController {
    /**
     * GET /api/v1/boost/packages
     * List all active customer boost packages (Section 25, 27)
     */
    static async getPackages(_req, res) {
        try {
            const packages = await prisma_1.prisma.boostPackage.findMany({
                where: { isActive: true },
                orderBy: { displayOrder: 'asc' },
            });
            return res.status(200).json({
                success: true,
                data: packages,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch boost packages' },
            });
        }
    }
    /**
     * POST /api/v1/boost/create-order
     * Generate Razorpay order for requirement boost promotion (Section 26, 40)
     */
    static async createOrder(req, res) {
        try {
            const userId = req.user?.id;
            const { requirementId, packageId } = req.body;
            if (!requirementId || !packageId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'requirementId and packageId are required.' },
                });
            }
            // 1. Verify customer owns this requirement
            const customer = await prisma_1.prisma.customerProfile.findUnique({
                where: { userId },
            });
            if (!customer) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer profile not found.' },
                });
            }
            const requirement = await prisma_1.prisma.requirement.findFirst({
                where: {
                    id: requirementId,
                    customerId: customer.id,
                },
            });
            if (!requirement) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'REQUIREMENT_NOT_FOUND', message: 'Requirement not found or access denied.' },
                });
            }
            // Check if requirement is in active state
            const allowedStatuses = ['PUBLISHED', 'RECEIVING_QUOTES', 'SHORTLISTED'];
            if (!allowedStatuses.includes(requirement.status)) {
                return res.status(400).json({
                    success: false,
                    error: { message: `Cannot boost a requirement with status "${requirement.status}".` },
                });
            }
            // 2. Fetch boost package
            const boostPackage = await prisma_1.prisma.boostPackage.findUnique({
                where: { id: packageId },
            });
            if (!boostPackage || !boostPackage.isActive) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Boost package not found or inactive.' },
                });
            }
            const receipt = `boost_${requirement.id.substring(0, 8)}_${Date.now()}`;
            const razorpayOrder = await razorpay_service_1.RazorpayService.createOrder(boostPackage.price, receipt, {
                requirementId: requirement.id,
                boostPackageId: boostPackage.id,
                customerId: customer.id,
                userId: userId || '',
                type: 'REQUIREMENT_BOOST',
            });
            // Pre-record pending Payment record
            await prisma_1.prisma.payment.create({
                data: {
                    userId,
                    orderId: receipt,
                    razorpayOrderId: razorpayOrder.id,
                    amount: boostPackage.price,
                    currency: 'INR',
                    status: 'CREATED',
                    paymentPurpose: 'REQUIREMENT_BOOST',
                    description: `Boost: ${boostPackage.name} (${boostPackage.durationDays} Days, ₹${boostPackage.price}) for "${requirement.title}"`,
                },
            });
            return res.status(200).json({
                success: true,
                message: 'Boost order created successfully.',
                data: {
                    orderId: razorpayOrder.id,
                    amount: razorpayOrder.amount, // in paise
                    amountInr: boostPackage.price,
                    currency: razorpayOrder.currency,
                    keyId: razorpay_service_1.RazorpayService.getKeyId(),
                    package: boostPackage,
                    requirement: {
                        id: requirement.id,
                        title: requirement.title,
                    },
                    user: {
                        name: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(),
                        email: req.user?.email || '',
                        phone: req.user?.phone || '',
                    },
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to create boost order' },
            });
        }
    }
    /**
     * POST /api/v1/boost/verify-payment
     * Cryptographically verify signature and activate requirement boost (Section 27, 40)
     */
    static async verifyPayment(req, res) {
        try {
            const userId = req.user?.id;
            const { orderId, paymentId, signature, requirementId, packageId } = req.body;
            if (!orderId || !paymentId || !requirementId || !packageId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'orderId, paymentId, requirementId, and packageId are required.' },
                });
            }
            // Verify signature
            const isValid = razorpay_service_1.RazorpayService.verifyPaymentSignature(orderId, paymentId, signature);
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_SIGNATURE', message: 'Cryptographic payment verification failed.' },
                });
            }
            const customer = await prisma_1.prisma.customerProfile.findUnique({
                where: { userId },
            });
            if (!customer) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer profile not found.' },
                });
            }
            const requirement = await prisma_1.prisma.requirement.findFirst({
                where: { id: requirementId, customerId: customer.id },
            });
            if (!requirement) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'REQUIREMENT_NOT_FOUND', message: 'Requirement not found.' },
                });
            }
            const boostPackage = await prisma_1.prisma.boostPackage.findUnique({
                where: { id: packageId },
            });
            if (!boostPackage) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Boost package not found.' },
                });
            }
            // Update payment record
            await prisma_1.prisma.payment.updateMany({
                where: { razorpayOrderId: orderId },
                data: {
                    status: 'CAPTURED',
                    razorpayPaymentId: paymentId,
                    capturedAt: new Date(),
                },
            });
            // Calculate start and expiry (extend if already boosted)
            const now = new Date();
            let startsAt = now;
            let expiresAt;
            if (requirement.isBoosted && requirement.boostExpiresAt && requirement.boostExpiresAt > now) {
                // Extend existing boost duration
                expiresAt = new Date(requirement.boostExpiresAt.getTime() + boostPackage.durationDays * 24 * 60 * 60 * 1000);
            }
            else {
                expiresAt = new Date(now.getTime() + boostPackage.durationDays * 24 * 60 * 60 * 1000);
            }
            // Create RequirementBoost record
            const boost = await prisma_1.prisma.requirementBoost.create({
                data: {
                    requirementId: requirement.id,
                    customerId: customer.id,
                    boostPackageId: boostPackage.id,
                    paymentId: paymentId,
                    razorpayOrderId: orderId,
                    razorpayPaymentId: paymentId,
                    startsAt,
                    expiresAt,
                    status: 'ACTIVE',
                },
                include: {
                    package: true,
                },
            });
            // Update Requirement with boost flags
            const updatedRequirement = await prisma_1.prisma.requirement.update({
                where: { id: requirement.id },
                data: {
                    isBoosted: true,
                    boostPriority: Math.max(requirement.boostPriority || 0, boostPackage.priority),
                    boostExpiresAt: expiresAt,
                },
            });
            return res.status(200).json({
                success: true,
                message: `Boost activated! Your requirement will receive priority placement for ${boostPackage.durationDays} days.`,
                data: {
                    boost,
                    requirement: {
                        id: updatedRequirement.id,
                        isBoosted: updatedRequirement.isBoosted,
                        boostPriority: updatedRequirement.boostPriority,
                        boostExpiresAt: updatedRequirement.boostExpiresAt,
                    },
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to verify boost payment' },
            });
        }
    }
    /**
     * GET /api/v1/boost/requirement/:requirementId
     * Retrieve active boost status for a specific requirement
     */
    static async getRequirementBoost(req, res) {
        try {
            const { requirementId } = req.params;
            const now = new Date();
            const activeBoost = await prisma_1.prisma.requirementBoost.findFirst({
                where: {
                    requirementId,
                    status: 'ACTIVE',
                    expiresAt: { gt: now },
                },
                include: { package: true },
                orderBy: { expiresAt: 'desc' },
            });
            return res.status(200).json({
                success: true,
                data: activeBoost,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch boost status' },
            });
        }
    }
}
exports.BoostController = BoostController;
