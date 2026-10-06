import { prisma } from '../../lib/prisma';
import {
  CallingProvider,
  V1CallingProvider,
  CreateCallSessionParams,
  CallSessionResult,
} from './calling.provider';

export class CallingService {
  private static provider: CallingProvider = new V1CallingProvider();

  /**
   * Allows registration of future Masked / Proxy calling providers
   * (e.g. ExotelMaskedProvider, TwilioProxyProvider) without changing client or DB logic.
   */
  public static registerProvider(customProvider: CallingProvider): void {
    this.provider = customProvider;
  }

  public static getActiveProviderName(): string {
    return this.provider.name;
  }

  /**
   * Creates and registers a new call session linked to a CallRequest / Job.
   */
  public static async createSession(params: CreateCallSessionParams): Promise<CallSessionResult> {
    const providerResult = await this.provider.createCallSession(params);

    // Persist session record in DB
    const dbSession = await prisma.callSession.create({
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
  public static async startCall(sessionId: string): Promise<CallSessionResult> {
    const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new Error('Call session not found');
    }

    const providerResult = await this.provider.startCall(session.providerSessionId || sessionId);

    await prisma.callSession.update({
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
  public static async endCall(sessionId: string): Promise<CallSessionResult> {
    const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new Error('Call session not found');
    }

    const providerResult = await this.provider.endCall(session.providerSessionId || sessionId);

    await prisma.callSession.update({
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
  public static async getSession(sessionId: string): Promise<any> {
    const session = await prisma.callSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return null;

    return {
      id: session.id,
      jobId: session.jobId,
      status: session.status,
      provider: session.callProvider,
      durationSeconds: session.durationSeconds,
      createdAt: session.createdAt,
      displayInstructions:
        'Calls through Vaziro are privacy-protected. Real telephone numbers are never exposed to either party.',
    };
  }
}
