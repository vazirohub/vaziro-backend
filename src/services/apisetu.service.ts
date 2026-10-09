import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { TrustScoreService } from './trust-score.service';
import { NotificationService } from './notification.service';

export interface ApiSetuTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  [key: string]: any;
}

export interface ApiSetuUserProfile {
  sub?: string;
  name?: string;
  preferred_username?: string;
  gender?: string;
  birthdate?: string;
  email?: string;
  phone_number?: string;
  address?: {
    formatted?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  digilocker_id?: string;
  [key: string]: any;
}

export class ApiSetuService {
  /**
   * Generates a tamper-proof state token and MeriPehchaan / API Setu OAuth2 authorization URL with PKCE (S256)
   */
  static generateAuthorizationUrl(
    userId: string,
    existingRequestId?: string
  ): { authUrl: string; state: string; requestId: string } {
    const requestId = existingRequestId || uuidv4();
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const statePayload = {
      userId,
      requestId,
      codeVerifier,
      provider: 'DIGILOCKER',
      timestamp: Date.now(),
    };

    const state = jwt.sign(statePayload, config.jwt.secret, { expiresIn: '15m' });

    const authUrl = new URL(config.apisetu.authUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.apisetu.clientId);
    authUrl.searchParams.set('redirect_uri', config.apisetu.redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('scope', 'openid');

    return {
      authUrl: authUrl.toString(),
      state,
      requestId,
    };
  }

  /**
   * Verifies the OAuth2 state token against tampering and extracts the verified userId, requestId, and PKCE codeVerifier
   */
  static verifyState(state: string): { userId: string; requestId?: string; codeVerifier?: string; provider?: string } {
    try {
      const decoded = jwt.verify(state, config.jwt.secret) as {
        userId: string;
        requestId?: string;
        codeVerifier?: string;
        provider?: string;
      };
      if (!decoded.userId) {
        throw new Error('Invalid state payload');
      }
      return {
        userId: decoded.userId,
        requestId: decoded.requestId,
        codeVerifier: decoded.codeVerifier,
        provider: decoded.provider,
      };
    } catch {
      throw new Error('State verification failed. The verification session may have expired. Please try again.');
    }
  }

  /**
   * Exchanges authorization code for an OAuth2 access token at API Setu / MeriPehchaan token endpoint using PKCE
   */
  static async exchangeCodeForToken(code: string, codeVerifier?: string): Promise<ApiSetuTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.apisetu.redirectUri,
      client_id: config.apisetu.clientId,
      client_secret: config.apisetu.clientSecret,
    });

    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

    const basicAuth = Buffer.from(`${config.apisetu.clientId}:${config.apisetu.clientSecret}`).toString('base64');

    try {
      const response = await fetch(config.apisetu.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      const data: any = await response.json().catch(() => null);

      if (!response.ok || !data?.access_token) {
        const errorMsg = data?.error_description || data?.error || `API Setu token exchange failed (${response.status})`;
        throw new Error(errorMsg);
      }

      return data as ApiSetuTokenResponse;
    } catch (err: any) {
      console.warn('[ApiSetuService] Token exchange notice:', err.message);

      // Safe test sandbox pass-through for development testing
      if (process.env.NODE_ENV !== 'production' && (code === 'mock_test_code' || code.startsWith('test_'))) {
        return {
          access_token: `mock_apisetu_access_token_${Date.now()}`,
          token_type: 'Bearer',
          expires_in: 3600,
        };
      }

      throw new Error(err.message || 'Failed to exchange authorization code with API Setu');
    }
  }

  /**
   * Fetches verified citizen profile details from API Setu / MeriPehchaan userInfo endpoint
   */
  static async fetchUserProfile(accessToken: string): Promise<ApiSetuUserProfile> {
    try {
      const response = await fetch(config.apisetu.userInfoUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      const data: any = await response.json().catch(() => null);

      if (!response.ok || !data) {
        throw new Error(data?.error_description || `API Setu userinfo request failed (${response.status})`);
      }

      return data as ApiSetuUserProfile;
    } catch (err: any) {
      console.warn('[ApiSetuService] UserInfo notice:', err.message);

      // Resilient fallback for sandbox testing
      if (process.env.NODE_ENV !== 'production' && accessToken.startsWith('mock_')) {
        return {
          sub: 'DL-MOCK-USER-12345',
          name: 'Rajesh Kumar',
          gender: 'M',
          birthdate: '1992-05-15',
          digilocker_id: 'DL-MOCK-998877',
        };
      }

      throw new Error(err.message || 'Failed to retrieve profile from DigiLocker / API Setu');
    }
  }

  /**
   * Evaluates name matching between user registered name and government verified name
   */
  static evaluateNameMatch(
    registeredName: string,
    verifiedName: string
  ): 'MATCH' | 'PARTIAL' | 'MISMATCH' | 'NOT_AVAILABLE' {
    if (!registeredName || !verifiedName) return 'NOT_AVAILABLE';

    const clean = (s: string) =>
      s
        .toLowerCase()
        .replace(/^(mr|ms|mrs|shri|smt|dr)\.?\s+/i, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    const reg = clean(registeredName);
    const ver = clean(verifiedName);

    if (!reg || !ver) return 'NOT_AVAILABLE';
    if (reg === ver) return 'MATCH';

    // Substring or word check
    const regWords = reg.split(/\s+/).filter(Boolean);
    const verWords = ver.split(/\s+/).filter(Boolean);

    if (ver.includes(reg) || reg.includes(ver)) {
      return 'MATCH';
    }

    const commonWords = regWords.filter((w) => verWords.includes(w) && w.length >= 2);
    if (commonWords.length >= Math.min(regWords.length, verWords.length)) {
      return 'MATCH';
    }

    if (commonWords.length > 0) {
      return 'PARTIAL';
    }

    return 'MISMATCH';
  }

  /**
   * Completes the end-to-end DigiLocker verification for a service professional
   */
  static async completeVerification(
    userId: string,
    code: string,
    expectedRequestId?: string,
    codeVerifier?: string
  ): Promise<{
    verificationStatus: 'VERIFIED' | 'REVIEW_REQUIRED';
    badgeText: string;
    verifiedAt?: Date;
    verifiedName: string;
    digiLockerId: string;
    nameMatchStatus: string;
    reviewReason?: string;
  }> {
    const profile = await prisma.professionalProfile.findUnique({
      where: { userId },
      include: { verification: true, user: true },
    });

    if (!profile) {
      throw new Error('Professional profile not found for this user account.');
    }

    // Replay attack and state correlation protection
    if (expectedRequestId && profile.verification) {
      if (profile.verification.status === 'VERIFIED') {
        throw new Error('This account has already been verified.');
      }
      if (!profile.verification.requestId || profile.verification.requestId !== expectedRequestId) {
        throw new Error('Verification session correlation mismatch or session already used. Please start a new verification session.');
      }
    }

    // 1. Exchange code for access token using PKCE verifier
    const tokenData = await this.exchangeCodeForToken(code, codeVerifier);

    // 2. Fetch government-verified citizen profile or decode from Token/ID-Token
    let userInfo: any = null;
    if (tokenData?.access_token) {
      try {
        userInfo = await this.fetchUserProfile(tokenData.access_token);
      } catch (e: any) {
        console.warn('[ApiSetuService] Notice: /userinfo call was not processed by provider, reading token data directly:', e.message);
      }
    }

    if (!userInfo && tokenData.id_token) {
      try {
        const decoded = jwt.decode(tokenData.id_token) as any;
        if (decoded && typeof decoded === 'object') {
          userInfo = decoded;
        }
      } catch {}
    }

    if (!userInfo) {
      userInfo = {
        digilocker_id: (tokenData as any).digilockerid || (tokenData as any).digilocker_id || (tokenData as any).sub,
        name: (tokenData as any).name || (tokenData as any).userName,
        gender: (tokenData as any).gender,
        birthdate: (tokenData as any).dob,
      };
    }

    const digiLockerId = userInfo.digilocker_id || userInfo.sub || `DL-IN-${Date.now()}`;
    const verifiedName = userInfo.name || `${profile.user.firstName} ${profile.user.lastName}`.trim();
    const registeredName = `${profile.user.firstName} ${profile.user.lastName}`.trim();
    const verifiedAt = new Date();

    const nameMatchStatus = this.evaluateNameMatch(registeredName, verifiedName);

    // If name is a complete mismatch, mark for manual administrative review
    const isMismatch = nameMatchStatus === 'MISMATCH';
    const targetStatus = isMismatch ? 'REVIEW_REQUIRED' : 'VERIFIED';
    const reviewReason = isMismatch
      ? `Name discrepancy: Registered as "${registeredName}" but DigiLocker confirmed as "${verifiedName}". Requires administrative review.`
      : null;

    // 3. Atomically record verification status in database
    await prisma.$transaction(async (tx) => {
      const verData = {
        status: targetStatus,
        provider: 'DIGILOCKER',
        referenceId: digiLockerId,
        verificationReference: digiLockerId,
        documentType: 'AADHAAR',
        nameMatchStatus,
        verifiedAt: isMismatch ? null : verifiedAt,
        failureReason: null,
        reviewReason,
        requestId: null, // Clear requestId to prevent replay attacks
        providerResponse: JSON.stringify({
          sub: userInfo.sub ? '***' : undefined,
          name: verifiedName,
          matchStatus: nameMatchStatus,
          verifiedAt: verifiedAt.toISOString(),
        }),
      };

      if (profile.verification) {
        await tx.verification.update({
          where: { id: profile.verification.id },
          data: verData,
        });
      } else {
        await tx.verification.create({
          data: {
            professionalProfileId: profile.id,
            ...verData,
          },
        });
      }

      await tx.professionalProfile.update({
        where: { id: profile.id },
        data: { isVerified: !isMismatch },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId,
          action: isMismatch ? 'VERIFICATION_REVIEW_REQUIRED' : 'VERIFICATION_SUCCESS',
          entityType: 'Verification',
          entityId: profile.id,
          metadata: JSON.stringify({
            provider: 'DIGILOCKER',
            referenceId: digiLockerId,
            nameMatchStatus,
            status: targetStatus,
          }),
        },
      });
    });

    // Automatically recalculate Profile Strength and Trust Score
    await TrustScoreService.recalculate(profile.id).catch(() => {});

    // Notify administration at info@vaziro.in
    NotificationService.notifyAdminEvent({
      eventType: 'VERIFICATION',
      title: isMismatch
        ? `DigiLocker Review Required: ${registeredName}`
        : `DigiLocker Identity Verified: ${verifiedName}`,
      message: isMismatch
        ? `Professional "${registeredName}" completed DigiLocker authentication, but government records returned "${verifiedName}". Manual administrative review is required.`
        : `Professional "${verifiedName}" (${profile.user?.email || profile.user?.phone || 'Account ID ' + userId}) has verified their identity via DigiLocker (Aadhaar).`,
      metadata: [
        { label: 'Professional Name', value: verifiedName },
        { label: 'Registered Name', value: registeredName },
        { label: 'DigiLocker ID', value: digiLockerId },
        { label: 'Name Match Status', value: nameMatchStatus },
        { label: 'Status', value: targetStatus },
      ],
      actionUrl: '/admin',
      actionText: 'Review Verifications in Admin',
    }).catch(() => {});

    return {
      verificationStatus: targetStatus,
      badgeText: isMismatch ? 'Review Required' : '✓ Verified via DigiLocker',
      verifiedAt: isMismatch ? undefined : verifiedAt,
      verifiedName,
      digiLockerId,
      nameMatchStatus,
      reviewReason: reviewReason || undefined,
    };
  }

  /**
   * Records a failed verification attempt with user-friendly message
   */
  static async recordFailure(
    userId: string,
    reason: string,
    requestId?: string
  ): Promise<void> {
    const profile = await prisma.professionalProfile.findUnique({
      where: { userId },
      include: { verification: true },
    });

    if (!profile) return;

    await prisma.$transaction(async (tx) => {
      if (profile.verification) {
        await tx.verification.update({
          where: { id: profile.verification.id },
          data: {
            status: 'FAILED',
            failureReason: reason,
            requestId: null, // Clear to allow clean retry
          },
        });
      } else {
        await tx.verification.create({
          data: {
            professionalProfileId: profile.id,
            status: 'FAILED',
            provider: 'DIGILOCKER',
            failureReason: reason,
          },
        });
      }

      await tx.professionalProfile.update({
        where: { id: profile.id },
        data: { isVerified: false },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'VERIFICATION_FAILED',
          entityType: 'Verification',
          entityId: profile.id,
          metadata: JSON.stringify({
            provider: 'DIGILOCKER',
            failureReason: reason,
            requestId,
          }),
        },
      });
    });
  }

  /**
   * Handles asynchronous webhook event from API Setu / DigiLocker
   */
  static async handleWebhook(payload: any): Promise<{ processed: boolean; message: string }> {
    const { transactionId, requestId, status, referenceId, failureReason } = payload || {};

    if (!requestId && !transactionId) {
      return { processed: false, message: 'Missing requestId or transactionId in webhook payload' };
    }

    const verification = await prisma.verification.findFirst({
      where: {
        OR: [
          requestId ? { requestId } : undefined,
          transactionId ? { transactionId } : undefined,
        ].filter(Boolean) as any,
      },
      include: { professional: true },
    });

    if (!verification) {
      return { processed: false, message: 'No matching verification record found' };
    }

    // Idempotency: if already VERIFIED, do not alter
    if (verification.status === 'VERIFIED') {
      return { processed: true, message: 'Verification already completed' };
    }

    const newStatus = status === 'SUCCESS' || status === 'VERIFIED' ? 'VERIFIED' : 'FAILED';
    const isVerified = newStatus === 'VERIFIED';

    await prisma.$transaction(async (tx) => {
      await tx.verification.update({
        where: { id: verification.id },
        data: {
          status: newStatus,
          referenceId: referenceId || verification.referenceId,
          verifiedAt: isVerified ? new Date() : null,
          failureReason: isVerified ? null : failureReason || 'Failed via provider webhook',
        },
      });

      await tx.professionalProfile.update({
        where: { id: verification.professionalProfileId },
        data: { isVerified },
      });

      await tx.auditLog.create({
        data: {
          action: isVerified ? 'VERIFICATION_SUCCESS' : 'VERIFICATION_FAILED',
          entityType: 'Verification',
          entityId: verification.id,
          metadata: JSON.stringify({
            source: 'WEBHOOK',
            status: newStatus,
            transactionId,
          }),
        },
      });
    });

    return { processed: true, message: `Webhook processed successfully: ${newStatus}` };
  }
}
