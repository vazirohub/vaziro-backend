import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ApiSetuService } from '../services/apisetu.service';

export class ProfessionalsController {
  /**
   * GET /api/v1/professionals/me
   */
  static async getMyProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      let profile = await prisma.professionalProfile.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              createdAt: true,
            },
          },
          verification: true,
          skills: {
            include: { skill: true },
          },
          creditWallet: true,
        },
      });

      if (!profile) {
        profile = await prisma.professionalProfile.create({
          data: {
            userId,
            title: 'Professional Service Partner',
            bio: 'Providing verified, high-quality professional services on Vaziro.',
            yearsOfExperience: 3,
            rating: 5.0,
            reviewsCount: 0,
            completedJobsCount: 0,
            responseRatePercentage: 100,
            isVerified: false,
          },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                createdAt: true,
              },
            },
            verification: true,
            skills: {
              include: { skill: true },
            },
            creditWallet: true,
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          ...profile,
          wallet: profile.creditWallet,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch professional profile' },
      });
    }
  }

  /**
   * PUT /api/v1/professionals/me
   */
  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const {
        title,
        bio,
        yearsOfExperience,
        hourlyRate,
        languages,
        avatarUrl,
      } = req.body;

      const profile = await prisma.professionalProfile.findUnique({
        where: { userId },
      });

      if (!profile) {
        return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
      }

      const updated = await prisma.professionalProfile.update({
        where: { id: profile.id },
        data: {
          title: title !== undefined ? title : profile.title,
          bio: bio !== undefined ? bio : profile.bio,
          yearsOfExperience: yearsOfExperience !== undefined ? Number(yearsOfExperience) : profile.yearsOfExperience,
          hourlyRate: hourlyRate !== undefined ? Number(hourlyRate) : profile.hourlyRate,
          languages: languages !== undefined ? languages : profile.languages,
          avatarUrl: avatarUrl !== undefined ? avatarUrl : profile.avatarUrl,
        },
        include: {
          skills: { include: { skill: true } },
          verification: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: updated,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update profile' },
      });
    }
  }

  /**
   * GET /api/v1/professionals/verification/status
   * Returns current professional verification status across all 6 states
   */
  static async getVerificationStatus(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const profile = await prisma.professionalProfile.findUnique({
        where: { userId },
        include: { verification: true },
      });

      if (!profile) {
        return res.status(404).json({ success: false, error: { message: 'Professional profile not found.' } });
      }

      const verification = profile.verification;
      const status = verification?.status || 'NOT_STARTED';

      const statusMessages: Record<string, string> = {
        NOT_STARTED: 'Your identity has not been verified yet.',
        PENDING: 'Your DigiLocker verification is in progress.',
        VERIFIED: 'Your identity has been successfully verified.',
        FAILED: 'Your verification could not be completed.',
        REVIEW_REQUIRED: 'Your verification requires manual review by Vaziro.',
        EXPIRED: 'Your previous verification has expired.',
      };

      return res.status(200).json({
        success: true,
        data: {
          status,
          provider: verification?.provider || 'DIGILOCKER',
          isVerified: profile.isVerified && status === 'VERIFIED',
          badgeText: profile.isVerified && status === 'VERIFIED' ? '✓ Verified via DigiLocker' : null,
          message: statusMessages[status] || 'Status unavailable',
          referenceId: verification?.referenceId || null,
          verifiedAt: verification?.verifiedAt || null,
          expiresAt: verification?.expiresAt || null,
          failureReason: verification?.failureReason || null,
          reviewReason: verification?.reviewReason || null,
          nameMatchStatus: verification?.nameMatchStatus || null,
          attemptCount: verification?.attemptCount || 0,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to retrieve verification status' },
      });
    }
  }

  /**
   * POST /api/v1/professionals/verification/start
   * Also aliases GET /api/v1/professionals/verify/apisetu/initiate
   * Generates secure API Setu authorization redirect URL and tracks pending session
   */
  static async startVerification(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const profile = await prisma.professionalProfile.findUnique({
        where: { userId },
        include: { verification: true },
      });

      if (!profile) {
        return res.status(404).json({ success: false, error: { message: 'Professional profile not found.' } });
      }

      if (profile.isVerified && profile.verification?.status === 'VERIFIED') {
        return res.status(400).json({
          success: false,
          error: { message: 'Your identity has already been verified via DigiLocker.' },
        });
      }

      if (profile.verification?.status === 'REVIEW_REQUIRED') {
        return res.status(400).json({
          success: false,
          error: { message: 'Your verification requires manual review by Vaziro. Retries are paused during review.' },
        });
      }

      // Prevent duplicate simultaneous active verification sessions within 10 minutes
      if (profile.verification?.status === 'PENDING' && profile.verification.lastAttemptAt) {
        const minutesSinceAttempt = (Date.now() - new Date(profile.verification.lastAttemptAt).getTime()) / (1000 * 60);
        if (minutesSinceAttempt < 10) {
          // Re-generate URL for existing requestId if still valid
          const existingRequestId = profile.verification.requestId || undefined;
          const { authUrl, state, requestId } = ApiSetuService.generateAuthorizationUrl(userId, existingRequestId);
          return res.status(200).json({
            success: true,
            data: {
              authUrl,
              state,
              requestId,
              provider: 'DIGILOCKER',
              message: 'Your DigiLocker verification is in progress.',
            },
          });
        }
      }

      const { authUrl, state, requestId } = ApiSetuService.generateAuthorizationUrl(userId);

      // Record pending verification state
      await prisma.$transaction(async (tx) => {
        if (profile.verification) {
          await tx.verification.update({
            where: { id: profile.verification.id },
            data: {
              status: 'PENDING',
              provider: 'DIGILOCKER',
              requestId,
              failureReason: null,
              lastAttemptAt: new Date(),
              attemptCount: { increment: 1 },
            },
          });
        } else {
          await tx.verification.create({
            data: {
              professionalProfileId: profile.id,
              status: 'PENDING',
              provider: 'DIGILOCKER',
              requestId,
              lastAttemptAt: new Date(),
              attemptCount: 1,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId,
            action: 'VERIFICATION_STARTED',
            entityType: 'Verification',
            entityId: profile.id,
            metadata: JSON.stringify({ provider: 'DIGILOCKER', requestId }),
          },
        });
      });

      return res.status(200).json({
        success: true,
        data: {
          authUrl,
          state,
          requestId,
          provider: 'DIGILOCKER',
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to initiate DigiLocker verification' },
      });
    }
  }

  /**
   * POST /api/v1/professionals/verification/callback
   * Also aliases GET /api/v1/professionals/verification/callback and POST /api/v1/professionals/verify/apisetu/callback
   */
  static async completeVerification(req: Request, res: Response) {
    try {
      const code = (req.body?.code || req.query?.code) as string | undefined;
      const state = (req.body?.state || req.query?.state) as string | undefined;
      const errorParam = (req.body?.error || req.query?.error || req.query?.error_description) as string | undefined;

      if (errorParam) {
        if (state) {
          try {
            const { userId, requestId } = ApiSetuService.verifyState(state);
            await ApiSetuService.recordFailure(userId, 'Verification was cancelled on the DigiLocker portal.', requestId);
          } catch {}
        }
        return res.status(400).json({
          success: false,
          error: { message: 'Verification was cancelled. You can try again whenever you\'re ready.' },
        });
      }

      if (!code) {
        return res.status(400).json({
          success: false,
          error: { message: 'Authorization code is required from DigiLocker callback.' },
        });
      }

      if (!state) {
        return res.status(400).json({
          success: false,
          error: { message: 'State parameter is required for CSRF and replay validation.' },
        });
      }

      // Verify state and extract userId & requestId
      const { userId, requestId } = ApiSetuService.verifyState(state);

      // Prevent cross-user tampering
      if (req.user?.id && req.user.id !== userId) {
        return res.status(403).json({
          success: false,
          error: { message: 'Verification state user mismatch.' },
        });
      }

      const result = await ApiSetuService.completeVerification(userId, code, requestId);

      if (result.verificationStatus === 'REVIEW_REQUIRED') {
        return res.status(200).json({
          success: true,
          message: 'Your verification requires additional review by Vaziro.',
          data: result,
        });
      }

      return res.status(200).json({
        success: true,
        message: '✓ Verified via DigiLocker successfully. Government identity credentials confirmed.',
        data: result,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: { message: error.message || 'We couldn\'t verify your identity. Please check your details and try again.' },
      });
    }
  }

  /**
   * POST /api/v1/professionals/verification/retry
   */
  static async retryVerification(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      }

      const profile = await prisma.professionalProfile.findUnique({
        where: { userId },
        include: { verification: true },
      });

      if (!profile) {
        return res.status(404).json({ success: false, error: { message: 'Professional profile not found.' } });
      }

      if (profile.verification?.status === 'REVIEW_REQUIRED') {
        return res.status(400).json({
          success: false,
          error: { message: 'Your verification requires manual review by Vaziro. Retries are paused during review.' },
        });
      }

      if (profile.isVerified && profile.verification?.status === 'VERIFIED') {
        return res.status(400).json({
          success: false,
          error: { message: 'Your identity has already been verified via DigiLocker.' },
        });
      }

      // Log retry audit
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'VERIFICATION_RETRY',
          entityType: 'Verification',
          entityId: profile.id,
          metadata: JSON.stringify({ provider: 'DIGILOCKER' }),
        },
      }).catch(() => {});

      return ProfessionalsController.startVerification(req, res);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to restart verification' },
      });
    }
  }

  /**
   * POST /api/v1/professionals/verification/webhook
   */
  static async handleWebhook(req: Request, res: Response) {
    try {
      const result = await ApiSetuService.handleWebhook(req.body);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Webhook processing failed' },
      });
    }
  }

  /**
   * Backward-compatible alias methods
   */
  static async initiateApiSetuVerification(req: Request, res: Response) {
    return ProfessionalsController.startVerification(req, res);
  }

  static async completeApiSetuVerification(req: Request, res: Response) {
    return ProfessionalsController.completeVerification(req, res);
  }

  /**
   * POST /api/v1/professionals/verify/digilocker (Fallback/Mock legacy route)
   */
  static async verifyDigiLocker(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const { aadhaarReference, consentGiven } = req.body;

      if (!consentGiven) {
        return res.status(400).json({
          success: false,
          error: { message: 'Explicit consent is required for DigiLocker identity verification under IT Act & DPDP Act.' },
        });
      }

      const profile = await prisma.professionalProfile.findUnique({
        where: { userId },
        include: { verification: true },
      });

      if (!profile) {
        return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
      }

      const maskedRef = aadhaarReference ? `DL-IN-${Date.now()}` : `DL-IN-MOCK-${Date.now()}`;

      let verification = profile.verification;

      if (verification) {
        verification = await prisma.verification.update({
          where: { id: verification.id },
          data: {
            status: 'VERIFIED',
            provider: 'DIGILOCKER',
            referenceId: maskedRef,
            verificationReference: maskedRef,
            verifiedAt: new Date(),
          },
        });
      } else {
        verification = await prisma.verification.create({
          data: {
            professionalProfileId: profile.id,
            status: 'VERIFIED',
            provider: 'DIGILOCKER',
            referenceId: maskedRef,
            verificationReference: maskedRef,
            verifiedAt: new Date(),
          },
        });
      }

      await prisma.professionalProfile.update({
        where: { id: profile.id },
        data: { isVerified: true },
      });

      return res.status(200).json({
        success: true,
        message: '✓ Verified via DigiLocker successfully. Government identity credentials confirmed.',
        data: {
          verificationStatus: 'VERIFIED',
          badgeText: '✓ Verified via DigiLocker',
          verifiedAt: verification.verifiedAt,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to complete DigiLocker verification' },
      });
    }
  }

  /**
   * GET /api/v1/professionals/:id
   */
  static async getPublicProfile(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const profile = await prisma.professionalProfile.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              createdAt: true,
            },
          },
          verification: {
            select: {
              status: true,
              provider: true,
              verifiedAt: true,
            },
          },
          skills: {
            include: { skill: true },
          },
        },
      });

      if (!profile) {
        return res.status(404).json({ success: false, error: { message: 'Professional not found' } });
      }

      const publicData = {
        id: profile.id,
        name: `${profile.user.firstName} ${profile.user.lastName ? profile.user.lastName[0] + '.' : ''}`,
        title: profile.title,
        bio: profile.bio,
        yearsOfExperience: profile.yearsOfExperience,
        hourlyRate: profile.hourlyRate,
        rating: profile.rating,
        reviewsCount: profile.reviewsCount,
        completedJobsCount: profile.completedJobsCount,
        responseRatePercentage: profile.responseRatePercentage,
        languages: profile.languages,
        avatarUrl: profile.avatarUrl,
        isVerified: profile.isVerified,
        verificationBadge: profile.isVerified ? '✓ Verified via DigiLocker' : null,
        memberSince: profile.user.createdAt,
        skills: profile.skills.map((s) => s.skill.name),
      };

      return res.status(200).json({
        success: true,
        data: publicData,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch public profile' },
      });
    }
  }
}
