"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditsController = void 0;
const prisma_1 = require("../lib/prisma");
const credit_service_1 = require("../services/credit.service");
const razorpay_service_1 = require("../services/razorpay.service");
class CreditsController {
    /**
     * GET /api/v1/credits/wallet
     * Returns current professional wallet and transaction ledger
     */
    static async getWallet(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            // Find professional profile for user
            const prof = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
            });
            if (!prof) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'PROFILE_NOT_FOUND', message: 'Professional profile not found for this user.' },
                });
            }
            const wallet = await credit_service_1.CreditService.getOrCreateWallet(prof.id);
            return res.status(200).json({
                success: true,
                data: wallet,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to retrieve credit wallet' },
            });
        }
    }
    /**
     * POST /api/v1/credits/calculate-fee
     * Calculates required application credits for a given budget
     */
    static async calculateFee(req, res) {
        try {
            const { budgetMin, budgetMax } = req.body;
            if (!budgetMin || typeof budgetMin !== 'number' || budgetMin <= 0) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Valid minimum budget is required (positive number).' },
                });
            }
            const credits = await credit_service_1.CreditService.calculateFee(budgetMin, budgetMax);
            return res.status(200).json({
                success: true,
                data: {
                    budgetMin,
                    budgetMax: budgetMax || budgetMin,
                    creditsRequired: credits,
                    nominalCostInr: credits * 50,
                    currency: 'INR (₹)',
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to calculate application fee' },
            });
        }
    }
    /**
     * GET /api/v1/credits/plans
     * List available credit plans
     */
    static async getPlans(req, res) {
        try {
            const plans = await prisma_1.prisma.creditPlan.findMany({
                where: { isActive: true },
                orderBy: { price: 'asc' },
            });
            return res.status(200).json({
                success: true,
                data: plans,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch credit plans' },
            });
        }
    }
    /**
     * POST /api/v1/credits/purchase
     * Purchase a credit bundle
     */
    static async purchasePlan(req, res) {
        try {
            const userId = req.user?.id;
            const { planId } = req.body;
            if (!planId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Plan ID is required.' },
                });
            }
            const prof = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
            });
            if (!prof) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'PROFILE_NOT_FOUND', message: 'Professional profile not found.' },
                });
            }
            const result = await credit_service_1.CreditService.purchasePlan(prof.id, planId);
            return res.status(200).json({
                success: true,
                message: 'Credit plan purchased successfully.',
                data: result,
            });
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'Failed to complete credit plan purchase' },
            });
        }
    }
    /**
     * POST /api/v1/credits/create-order
     * Generate Razorpay order for credit pack purchase
     */
    static async createOrder(req, res) {
        try {
            const userId = req.user?.id;
            const { planId } = req.body;
            if (!planId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Plan ID is required.' },
                });
            }
            const plan = await prisma_1.prisma.creditPlan.findUnique({
                where: { id: planId },
            });
            if (!plan || !plan.isActive) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Credit plan not found or inactive.' },
                });
            }
            const prof = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
            });
            if (!prof) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'PROFILE_NOT_FOUND', message: 'Professional profile not found.' },
                });
            }
            const receipt = `cr_${prof.id.substring(0, 8)}_${Date.now()}`;
            const razorpayOrder = await razorpay_service_1.RazorpayService.createOrder(plan.price, receipt, {
                planId: plan.id,
                professionalProfileId: prof.id,
                userId: userId || '',
                type: 'CREDIT_PURCHASE',
            });
            return res.status(200).json({
                success: true,
                message: 'Credit purchase order created successfully.',
                data: {
                    orderId: razorpayOrder.id,
                    amount: razorpayOrder.amount, // in paise
                    amountInr: plan.price,
                    currency: razorpayOrder.currency,
                    keyId: razorpay_service_1.RazorpayService.getKeyId(),
                    plan: {
                        id: plan.id,
                        name: plan.name,
                        creditsCount: plan.creditsCount,
                        price: plan.price,
                    },
                    user: {
                        name: `${req.user?.firstName} ${req.user?.lastName}`.trim(),
                        email: req.user?.email || '',
                        phone: req.user?.phone || '',
                    },
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to create credit order' },
            });
        }
    }
    /**
     * POST /api/v1/credits/verify-payment
     * Verify Razorpay signature and credit professional's wallet
     */
    static async verifyPayment(req, res) {
        try {
            const userId = req.user?.id;
            const { orderId, paymentId, signature, planId } = req.body;
            if (!orderId || !paymentId || !planId) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'orderId, paymentId, and planId are required.' },
                });
            }
            // Cryptographic verification
            const isValid = razorpay_service_1.RazorpayService.verifyPaymentSignature(orderId, paymentId, signature);
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_SIGNATURE', message: 'Cryptographic payment verification failed.' },
                });
            }
            const prof = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
            });
            if (!prof) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'PROFILE_NOT_FOUND', message: 'Professional profile not found.' },
                });
            }
            const result = await credit_service_1.CreditService.purchasePlan(prof.id, planId, paymentId);
            return res.status(200).json({
                success: true,
                message: 'Payment verified! Credits added to your wallet successfully.',
                data: result,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to verify payment' },
            });
        }
    }
}
exports.CreditsController = CreditsController;
