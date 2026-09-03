"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallsController = void 0;
const prisma_1 = require("../lib/prisma");
class CallsController {
    /**
     * POST /api/v1/calls/initiate
     */
    static async initiateCall(req, res) {
        try {
            const userId = req.user?.id;
            const { jobId } = req.body;
            if (!jobId) {
                return res.status(400).json({ success: false, error: { message: 'jobId is required.' } });
            }
            const job = await prisma_1.prisma.job.findUnique({
                where: { id: jobId },
                include: {
                    customer: { include: { user: true } },
                    professional: { include: { user: true } },
                },
            });
            if (!job) {
                return res.status(404).json({ success: false, error: { message: 'Job not found.' } });
            }
            const isCustomer = job.customer.userId === userId;
            const isProf = job.professional.userId === userId;
            if (!isCustomer && !isProf && !req.user?.roles.includes('ADMIN')) {
                return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
            }
            const virtualNumber = '+91 80 4719 2800';
            const callSessionId = `call_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const session = await prisma_1.prisma.callSession.create({
                data: {
                    jobId: job.id,
                    callerUserId: userId,
                    receiverUserId: isCustomer ? job.professional.userId : job.customer.userId,
                    callProvider: 'MOCK',
                    providerSessionId: callSessionId,
                    virtualMaskedNumber: virtualNumber,
                    status: 'INITIATED',
                },
            });
            return res.status(201).json({
                success: true,
                message: 'Masked call bridge initiated. Both parties will receive an incoming call from Vaziro Secure Line.',
                data: {
                    sessionId: session.id,
                    providerSessionId: session.providerSessionId,
                    maskedVirtualNumber: virtualNumber,
                    callerName: isCustomer ? `${job.customer.user.firstName}` : `${job.professional.user.firstName}`,
                    receiverName: isCustomer ? `${job.professional.user.firstName}` : `${job.customer.user.firstName}`,
                    status: 'CONNECTING',
                    instructions: 'Connecting your call through Vaziro Secure Bridge. Your real phone number will remain private.',
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to initiate masked call session' },
            });
        }
    }
    /**
     * GET /api/v1/calls/session/:id
     */
    static async getCallSession(req, res) {
        try {
            const { id } = req.params;
            const session = await prisma_1.prisma.callSession.findUnique({
                where: { id },
            });
            if (!session) {
                return res.status(404).json({ success: false, error: { message: 'Call session not found' } });
            }
            return res.status(200).json({
                success: true,
                data: session,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch call session' },
            });
        }
    }
}
exports.CallsController = CallsController;
