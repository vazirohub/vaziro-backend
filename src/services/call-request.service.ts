import { prisma } from '../lib/prisma';
import { CallingService } from './calling/calling.service';
import { SocketService } from './socket.service';
import { NotificationService } from './notification.service';
import { BlockService } from './block.service';

export interface CreateCallRequestParams {
  conversationId?: string;
  jobId?: string;
  requirementId?: string;
  receiverUserId?: string;
  requestedDate: string | Date;
  requestedStartTime: string;
  requestedEndTime?: string;
  message?: string;
}

export class CallRequestService {
  /**
   * Creates a new Call Request
   */
  public static async createCallRequest(
    requesterUserId: string,
    params: CreateCallRequestParams
  ) {
    const {
      conversationId,
      jobId,
      requirementId,
      requestedDate,
      requestedStartTime,
      requestedEndTime,
      message,
    } = params;

    let targetReceiverId = params.receiverUserId;
    let resolvedJobId = jobId;
    let resolvedReqId = requirementId;

    // Resolve receiver from conversation if not explicitly provided
    if (conversationId && !targetReceiverId) {
      const thread = await prisma.chatThread.findUnique({
        where: { id: conversationId },
        include: { participants: true, job: true },
      });

      if (!thread) {
        throw new Error('Conversation not found');
      }

      const isParticipant = thread.participants.some((p) => p.userId === requesterUserId);
      if (!isParticipant) {
        throw new Error('Unauthorized: You are not a participant in this conversation');
      }

      const other = thread.participants.find((p) => p.userId !== requesterUserId);
      if (!other) {
        throw new Error('No other participant found in this conversation');
      }
      targetReceiverId = other.userId;
      if (!resolvedJobId && thread.jobId) resolvedJobId = thread.jobId;
      if (!resolvedReqId && thread.requirementId) resolvedReqId = thread.requirementId;
    }

    if (!targetReceiverId) {
      throw new Error('Recipient user ID is required to request a call');
    }

    if (requesterUserId === targetReceiverId) {
      throw new Error('Cannot request a call with yourself');
    }

    // Check if blocked
    const blocked = await BlockService.isBlocked(requesterUserId, targetReceiverId);
    if (blocked) {
      throw new Error('Communication is blocked between these accounts');
    }

    // Parse & validate requested date
    const reqDateObj = new Date(requestedDate);
    if (isNaN(reqDateObj.getTime())) {
      throw new Error('Invalid requested date');
    }

    // Prevent duplicate pending requests for the same conversation
    if (conversationId) {
      const existingPending = await prisma.callRequest.findFirst({
        where: {
          chatThreadId: conversationId,
          requesterUserId,
          status: 'PENDING',
        },
      });

      if (existingPending) {
        throw new Error('You already have a pending call request in this conversation');
      }
    }

    const callRequest = await prisma.callRequest.create({
      data: {
        chatThreadId: conversationId || null,
        jobId: resolvedJobId || null,
        requirementId: resolvedReqId || null,
        requesterUserId,
        receiverUserId: targetReceiverId,
        status: 'PENDING',
        requestedDate: reqDateObj,
        requestedStartTime,
        requestedEndTime: requestedEndTime || null,
        message: message || null,
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify receiver
    const requesterName = `${callRequest.requester.firstName} ${callRequest.requester.lastName || ''}`.trim();
    const formattedDate = reqDateObj.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    await NotificationService.send({
      userId: targetReceiverId,
      type: 'JOB_STATUS',
      title: '📞 New Call Request',
      message: `${requesterName} requested a call on ${formattedDate} at ${requestedStartTime}.`,
      actionUrl: conversationId ? `/chat?thread=${conversationId}` : '/chat',
    });

    // Real-time Socket Event
    if (conversationId) {
      SocketService.emitToConversation(conversationId, 'call-request:new', callRequest);
    }
    SocketService.emitToUser(targetReceiverId, 'call-request:new', callRequest);

    return callRequest;
  }

  /**
   * Accepts a Call Request (only recipient can accept)
   */
  public static async acceptCallRequest(userId: string, callRequestId: string) {
    const callRequest = await prisma.callRequest.findUnique({
      where: { id: callRequestId },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!callRequest) {
      throw new Error('Call request not found');
    }

    if (callRequest.receiverUserId !== userId) {
      throw new Error('Unauthorized: Only the requested party can accept this call request');
    }

    if (callRequest.status !== 'PENDING') {
      throw new Error(`Cannot accept call request in status ${callRequest.status}`);
    }

    // Create session via CallingService abstraction
    const session = await CallingService.createSession({
      callRequestId: callRequest.id,
      conversationId: callRequest.chatThreadId || undefined,
      jobId: callRequest.jobId || undefined,
      callerUserId: callRequest.requesterUserId,
      receiverUserId: callRequest.receiverUserId,
      callerName: `${callRequest.requester.firstName} ${callRequest.requester.lastName || ''}`.trim(),
      receiverName: `${callRequest.receiver.firstName} ${callRequest.receiver.lastName || ''}`.trim(),
      scheduledTime: `${callRequest.requestedStartTime}`,
    });

    const updated = await prisma.callRequest.update({
      where: { id: callRequestId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        callSessionId: session.sessionId,
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify requester
    const receiverName = `${callRequest.receiver.firstName} ${callRequest.receiver.lastName || ''}`.trim();
    await NotificationService.send({
      userId: callRequest.requesterUserId,
      type: 'JOB_STATUS',
      title: '✓ Call Request Accepted',
      message: `${receiverName} accepted your call request for ${callRequest.requestedStartTime}.`,
      actionUrl: callRequest.chatThreadId ? `/chat?thread=${callRequest.chatThreadId}` : '/chat',
    });

    // Real-time Socket Events
    if (callRequest.chatThreadId) {
      SocketService.emitToConversation(callRequest.chatThreadId, 'call-request:accepted', {
        ...updated,
        session,
      });
      SocketService.emitToConversation(callRequest.chatThreadId, 'call:ready', session);
    }
    SocketService.emitToUser(callRequest.requesterUserId, 'call-request:accepted', {
      ...updated,
      session,
    });

    return {
      callRequest: updated,
      session,
    };
  }

  /**
   * Declines a Call Request (only recipient can decline)
   */
  public static async declineCallRequest(
    userId: string,
    callRequestId: string,
    reason?: string
  ) {
    const callRequest = await prisma.callRequest.findUnique({
      where: { id: callRequestId },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!callRequest) {
      throw new Error('Call request not found');
    }

    if (callRequest.receiverUserId !== userId) {
      throw new Error('Unauthorized: Only the requested party can decline this call request');
    }

    if (callRequest.status !== 'PENDING') {
      throw new Error(`Cannot decline call request in status ${callRequest.status}`);
    }

    const updated = await prisma.callRequest.update({
      where: { id: callRequestId },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
      },
    });

    const receiverName = `${callRequest.receiver.firstName} ${callRequest.receiver.lastName || ''}`.trim();
    await NotificationService.send({
      userId: callRequest.requesterUserId,
      type: 'JOB_STATUS',
      title: 'Call Request Declined',
      message: `${receiverName} was unable to accept the call request.${reason ? ` Reason: ${reason}` : ''}`,
      actionUrl: callRequest.chatThreadId ? `/chat?thread=${callRequest.chatThreadId}` : '/chat',
    });

    if (callRequest.chatThreadId) {
      SocketService.emitToConversation(callRequest.chatThreadId, 'call-request:declined', updated);
    }
    SocketService.emitToUser(callRequest.requesterUserId, 'call-request:declined', updated);

    return updated;
  }

  /**
   * Cancels a Call Request (only requester can cancel)
   */
  public static async cancelCallRequest(userId: string, callRequestId: string) {
    const callRequest = await prisma.callRequest.findUnique({
      where: { id: callRequestId },
    });

    if (!callRequest) {
      throw new Error('Call request not found');
    }

    if (callRequest.requesterUserId !== userId) {
      throw new Error('Unauthorized: Only the requester can cancel this call request');
    }

    if (callRequest.status !== 'PENDING') {
      throw new Error(`Cannot cancel call request in status ${callRequest.status}`);
    }

    const updated = await prisma.callRequest.update({
      where: { id: callRequestId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    if (callRequest.chatThreadId) {
      SocketService.emitToConversation(callRequest.chatThreadId, 'call-request:cancelled', updated);
    }
    SocketService.emitToUser(callRequest.receiverUserId, 'call-request:cancelled', updated);

    return updated;
  }

  /**
   * Lists Call Requests for a conversation
   */
  public static async getCallRequestsForConversation(
    conversationId: string,
    userId: string
  ) {
    const thread = await prisma.chatThread.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });

    if (!thread) {
      throw new Error('Conversation not found');
    }

    const isParticipant = thread.participants.some((p) => p.userId === userId);
    if (!isParticipant) {
      throw new Error('Unauthorized');
    }

    return prisma.callRequest.findMany({
      where: { chatThreadId: conversationId },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
