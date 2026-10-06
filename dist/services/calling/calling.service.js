"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallingService = void 0;
const prisma_1 = require("../../lib/prisma");
const calling_provider_1 = require("./calling.provider");
class CallingService {
    static provider = new calling_provider_1.V1CallingProvider();
    /**
     * Allows registration of future Masked / Proxy calling providers
     * (e.g. ExotelMaskedProvider, TwilioProxyProvider) without changing client or DB logic.
     */
    static registerProvider(customProvider) {
        this.provider = customProvider;
    }
    static getActiveProviderName() {
        return this.provider.name;
    }
    /**
     * Creates and registers a new call session linked to a CallRequest / Job.
     */
    static async createSession(params) {
        const providerResult = await this.provider.createCallSession(params);
        // Persist session record in DB
        const dbSession = await prisma_1.prisma.callSession.create({
            data: {
                jobId: params.jobId || null,
                callerUserId: params.callerUserId,
                receiverUserId: params.receiverUserId,
                callProvider: providerResult.provider,
                providerSessionId: providerResult.providerSessionId,
                status: providerResult.status,
            },
        });
        return {
            ...providerResult,
            sessionId: dbSession.id,
        };
    }
    /**
     * Starts or initiates connection for a call session.
     */
    static async startCall(sessionId) {
        const session = await prisma_1.prisma.callSession.findUnique({ where: { id: sessionId } });
        if (!session) {
            throw new Error('Call session not found');
        }
        const providerResult = await this.provider.startCall(session.providerSessionId || sessionId);
        await prisma_1.prisma.callSession.update({
            where: { id: sessionId },
            data: { status: providerResult.status },
        });
        return {
            ...providerResult,
            sessionId,
        };
    }
    /**
     * Ends an active call session.
     */
    static async endCall(sessionId) {
        const session = await prisma_1.prisma.callSession.findUnique({ where: { id: sessionId } });
        if (!session) {
            throw new Error('Call session not found');
        }
        const providerResult = await this.provider.endCall(session.providerSessionId || sessionId);
        await prisma_1.prisma.callSession.update({
            where: { id: sessionId },
            data: { status: 'COMPLETED' },
        });
        return {
            ...providerResult,
            sessionId,
        };
    }
    /**
     * Retrieves call session status.
     */
    static async getSession(sessionId) {
        const session = await prisma_1.prisma.callSession.findUnique({
            where: { id: sessionId },
        });
        if (!session)
            return null;
        return {
            id: session.id,
            jobId: session.jobId,
            status: session.status,
            provider: session.callProvider,
            durationSeconds: session.durationSeconds,
            createdAt: session.createdAt,
            displayInstructions: 'Calls through Vaziro are privacy-protected. Real telephone numbers are never exposed to either party.',
        };
    }
}
exports.CallingService = CallingService;
