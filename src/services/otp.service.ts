import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { Msg91Service } from './msg91.service';
import { ensureDatabaseSchema } from '../lib/auto-migrate';

export class OtpService {
  private static hashOtp(otp: string, phone: string): string {
    const salt = config.jwt.secret;
    return crypto
      .createHmac('sha256', salt)
      .update(`${phone}:${otp}`)
      .digest('hex');
  }

  static generateOtpCode(): string {
    // Generate secure 6-digit code between 100000 and 999999
    return crypto.randomInt(100000, 999999).toString();
  }

  static async requestOtp(
    phone: string,
    purpose: string = 'login',
    options?: { widgetDispatched?: boolean }
  ): Promise<{ success: boolean; message: string; cooldownSeconds: number }> {
    await ensureDatabaseSchema().catch(() => {});

    const { canonical, isValid } = Msg91Service.normalizeIndianMobile(phone);
    if (!isValid) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    // Check velocity rate limit (max 5 requests per 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - config.otp.rateLimitWindowMinutes * 60 * 1000);
    const recentRequestsCount = await prisma.otpVerification.count({
      where: {
        phone: canonical,
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (recentRequestsCount >= config.otp.rateLimitMaxRequests) {
      throw new Error('Too many OTP requests. Please wait a few minutes before trying again.');
    }

    // Check resend cooldown
    const latestOtp = await prisma.otpVerification.findFirst({
      where: { phone: canonical },
      orderBy: { createdAt: 'desc' },
    });

    if (latestOtp) {
      const elapsedSeconds = (Date.now() - latestOtp.createdAt.getTime()) / 1000;
      if (elapsedSeconds < config.otp.resendCooldownSeconds) {
        const remaining = Math.ceil(config.otp.resendCooldownSeconds - elapsedSeconds);
        return {
          success: false,
          message: `Please wait ${remaining} seconds before requesting a new OTP.`,
          cooldownSeconds: remaining,
        };
      }
    }

    // Invalidate previous unused OTPs for this phone
    await prisma.otpVerification.updateMany({
      where: { phone: canonical, isUsed: false },
      data: { isUsed: true },
    });

    // If already dispatched by MSG91 widget on client, record session for cooldown and avoid duplicate SMS
    if (options?.widgetDispatched) {
      await prisma.otpVerification.create({
        data: {
          phone: canonical,
          otpHash: 'MSG91_WIDGET_DISPATCHED',
          purpose,
          expiresAt: new Date(Date.now() + config.otp.expirySeconds * 1000),
          maxAttempts: config.otp.maxAttempts,
        },
      });

      console.log(`[OTP] Widget dispatch session registered for ${canonical}`);
      return {
        success: true,
        message: 'OTP dispatched via MSG91 widget.',
        cooldownSeconds: config.otp.resendCooldownSeconds,
      };
    }

    const otpCode = this.generateOtpCode();
    const otpHash = this.hashOtp(otpCode, canonical);
    const expiresAt = new Date(Date.now() + config.otp.expirySeconds * 1000);

    // Create new OTP record
    await prisma.otpVerification.create({
      data: {
        phone: canonical,
        otpHash,
        purpose,
        expiresAt,
        maxAttempts: config.otp.maxAttempts,
      },
    });

    // Send OTP via MSG91 server-side API (no secrets exposed to client)
    const msg91Res = await Msg91Service.sendOtp(canonical, otpCode);
    if (!msg91Res.success) {
      throw new Error(msg91Res.message || "We couldn't send the OTP right now. Please try again in a moment.");
    }

    return {
      success: true,
      message: 'OTP dispatched successfully.',
      cooldownSeconds: config.otp.resendCooldownSeconds,
    };
  }

  static async resendOtp(
    phone: string,
    purpose: string = 'resend',
    options?: { widgetDispatched?: boolean }
  ): Promise<{ success: boolean; message: string; cooldownSeconds: number }> {
    return this.requestOtp(phone, purpose, options);
  }

  static async verifyOtp(phone: string, otpCode: string, purpose: string = 'login'): Promise<boolean> {
    await ensureDatabaseSchema().catch(() => {});

    const { canonical, isValid } = Msg91Service.normalizeIndianMobile(phone);
    if (!isValid) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    const record = await prisma.otpVerification.findFirst({
      where: {
        phone: canonical,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new Error('This OTP has expired. Please request a new OTP.');
    }

    if (record.attempts >= record.maxAttempts) {
      await prisma.otpVerification.update({
        where: { id: record.id },
        data: { isUsed: true },
      });
      throw new Error('Too many incorrect attempts. Please request a new OTP.');
    }

    // Verify hash
    const inputHash = this.hashOtp(otpCode, canonical);
    let isValidHash = inputHash === record.otpHash;

    // Development / test-only bypass (strictly disabled in production)
    if (!isValidHash && process.env.NODE_ENV === 'test' && otpCode === '123456') {
      isValidHash = true;
    }

    if (!isValidHash) {
      const newAttempts = record.attempts + 1;
      await prisma.otpVerification.update({
        where: { id: record.id },
        data: {
          attempts: newAttempts,
          ...(newAttempts >= record.maxAttempts ? { isUsed: true } : {}),
        },
      });

      if (newAttempts >= record.maxAttempts) {
        throw new Error('Too many incorrect attempts. Please request a new OTP.');
      }
      throw new Error('The OTP is incorrect. Please check and try again.');
    }

    // Mark as successfully verified & used
    await prisma.otpVerification.update({
      where: { id: record.id },
      data: {
        isUsed: true,
        verifiedAt: new Date(),
      },
    });

    return true;
  }

  static async cleanupExpiredOtps(): Promise<void> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.otpVerification.deleteMany({
        where: {
          createdAt: { lt: oneDayAgo },
        },
      });
    } catch {
      // Non-blocking cleanup
    }
  }
}
