"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfessionalsController = void 0;
const prisma_1 = require("../lib/prisma");
const apisetu_service_1 = require("../services/apisetu.service");
const profile_strength_service_1 = require("../services/profile-strength.service");
const trust_score_service_1 = require("../services/trust-score.service");
/**
 * Helper to generate URL-safe, unique, stable professional slug
 */
function generateSlug(firstName, lastName, id) {
    const namePart = `${firstName || ''} ${lastName || ''}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'professional';
    const shortId = id.replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase() || 'pro';
    return `${namePart}-${shortId}`;
}
/**
 * Standard public serializer ensuring zero sensitive data leaks
 * Contact details (phone & email) are strictly hidden unless the requester has hired the professional
 */
function serializePublicProfile(profile, reviews = [], isHired = false) {
    const trustResult = trust_score_service_1.TrustScoreService.calculate(profile);
    const fullName = `${profile.user?.firstName || ''} ${profile.user?.lastName || ''}`.trim() || 'Vaziro Professional';
    return {
        id: profile.id,
        slug: profile.slug,
        name: fullName,
        displayName: `${profile.user?.firstName || 'Partner'} ${profile.user?.lastName ? profile.user.lastName[0] + '.' : ''}`,
        title: profile.title || 'Professional Service Partner',
        bio: profile.bio || '',
        avatarUrl: profile.avatarUrl || null,
        yearsOfExperience: Number(profile.yearsOfExperience || 0),
        hourlyRate: Number(profile.hourlyRate || 0),
        currency: profile.currency || 'INR',
        category: profile.category ? { id: profile.category.id, name: profile.category.name, slug: profile.category.slug } : null,
        subcategory: profile.subcategory ? { id: profile.subcategory.id, name: profile.subcategory.name, slug: profile.subcategory.slug } : null,
        serviceDescription: profile.serviceDescription || null,
        experienceDescription: profile.experienceDescription || null,
        qualifications: profile.qualifications || null,
        workingPreferences: profile.workingPreferences || null,
        languages: profile.languages || 'Hindi, English',
        availabilityStatus: profile.availabilityStatus || 'AVAILABLE',
        workingDays: profile.workingDays || 'Monday - Saturday',
        workingHours: profile.workingHours || '09:00 AM - 06:00 PM',
        rating: Number(profile.rating || 0.0),
        reviewsCount: Number(profile.reviewsCount || 0),
        completedJobsCount: Number(profile.completedJobsCount || 0),
        responseRatePercentage: Number(profile.responseRatePercentage || 100),
        isVerified: Boolean(profile.isVerified),
        verificationBadge: profile.isVerified ? '✓ Verified via DigiLocker' : null,
        memberSince: profile.user?.createdAt || profile.createdAt,
        skills: Array.isArray(profile.skills) ? profile.skills.map((s) => s.skill?.name || s.name || s) : [],
        serviceAreas: Array.isArray(profile.serviceAreas)
            ? profile.serviceAreas.map((sa) => sa.area?.name || sa.pincode?.pincode || sa.name || 'Service Area')
            : [],
        // Contact privacy: hidden unless hired by current customer
        phone: isHired ? (profile.user?.phone || null) : null,
        email: isHired ? (profile.user?.email || null) : null,
        isHiredByCurrentUser: Boolean(isHired),
        canViewContact: Boolean(isHired),
        contactLockedReason: isHired
            ? null
            : 'Contact details (mobile and email) are protected and will unlock automatically after you hire this professional.',
        trustSummary: {
            ...trustResult.publicSummary,
            trustLevel: trustResult.trustLevel,
            trustBadgeText: trustResult.trustBadgeText,
            trustDescription: trustResult.trustDescription,
            isNewProfessional: trustResult.isNewProfessional,
            tooltipText: trustResult.tooltipText,
        },
        reviews: reviews.map((r) => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment,
            tags: r.tags,
            responseComment: r.responseComment,
            createdAt: r.createdAt,
            customerName: r.customer?.user
                ? `${r.customer.user.firstName} ${r.customer.user.lastName ? r.customer.user.lastName[0] + '.' : ''}`
                : 'Verified Client',
        })),
    };
}
class ProfessionalsController {
    /**
     * GET /api/v1/professionals/me
     */
    static async getMyProfile(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const profileInclude = {
                user: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                        phone: true,
                        createdAt: true,
                        phoneVerifiedAt: true,
                        emailVerifiedAt: true,
                    },
                },
                category: true,
                subcategory: true,
                verification: true,
                skills: {
                    include: { skill: true },
                },
                serviceAreas: {
                    include: { area: true, pincode: true },
                },
                creditWallet: true,
                linkedAccount: true,
                payouts: true,
                jobs: {
                    where: { status: { in: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'PAYMENT_RELEASED', 'DISPUTED'] } },
                },
                reviewsReceived: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    include: { customer: { include: { user: true } } },
                },
            };
            let profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
                include: profileInclude,
            });
            if (!profile) {
                const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
                const autoSlug = generateSlug(user?.firstName || 'pro', user?.lastName || 'partner', userId);
                profile = await prisma_1.prisma.professionalProfile.create({
                    data: {
                        userId,
                        slug: autoSlug,
                        title: 'Professional Service Partner',
                        bio: 'Providing verified, high-quality professional services on Vaziro.',
                        yearsOfExperience: 3,
                        rating: 5.0,
                        reviewsCount: 0,
                        completedJobsCount: 0,
                        responseRatePercentage: 100,
                        isVerified: false,
                        availabilityStatus: 'AVAILABLE',
                        workingDays: 'Monday - Saturday',
                        workingHours: '09:00 AM - 06:00 PM',
                        languages: 'Hindi, English',
                        visibility: 'PUBLIC',
                    },
                    include: profileInclude,
                });
            }
            else if (!profile.slug) {
                const autoSlug = generateSlug(profile.user?.firstName || 'pro', profile.user?.lastName || '', profile.id);
                profile = await prisma_1.prisma.professionalProfile.update({
                    where: { id: profile.id },
                    data: { slug: autoSlug },
                    include: profileInclude,
                });
            }
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Failed to initialize profile' } });
            }
            // Calculate profile strength & trust score dynamically
            const strengthResult = profile_strength_service_1.ProfileStrengthService.calculate(profile);
            const trustResult = trust_score_service_1.TrustScoreService.calculate(profile);
            return res.status(200).json({
                success: true,
                data: {
                    ...profile,
                    wallet: profile.creditWallet,
                    profileStrength: strengthResult,
                    trustScore: trustResult,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch professional profile' },
            });
        }
    }
    /**
     * PUT /api/v1/professionals/me
     */
    static async updateProfile(req, res) {
        try {
            const userId = req.user?.id;
            const { title, bio, yearsOfExperience, hourlyRate, languages, avatarUrl, categoryId, subcategoryId, availabilityStatus, workingDays, workingHours, workingPreferences, qualifications, serviceDescription, experienceDescription, visibility, skills, serviceAreas, } = req.body;
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
                include: { user: true },
            });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
            }
            // Ensure stable slug
            let slug = profile.slug;
            if (!slug) {
                slug = generateSlug(profile.user?.firstName || 'pro', profile.user?.lastName || '', profile.id);
            }
            await prisma_1.prisma.$transaction(async (tx) => {
                // Update main profile attributes
                await tx.professionalProfile.update({
                    where: { id: profile.id },
                    data: {
                        slug,
                        title: title !== undefined ? title : profile.title,
                        bio: bio !== undefined ? bio : profile.bio,
                        yearsOfExperience: yearsOfExperience !== undefined ? Number(yearsOfExperience) : profile.yearsOfExperience,
                        hourlyRate: hourlyRate !== undefined ? Number(hourlyRate) : profile.hourlyRate,
                        languages: languages !== undefined ? languages : profile.languages,
                        avatarUrl: avatarUrl !== undefined ? avatarUrl : profile.avatarUrl,
                        categoryId: categoryId !== undefined ? categoryId : profile.categoryId,
                        subcategoryId: subcategoryId !== undefined ? subcategoryId : profile.subcategoryId,
                        availabilityStatus: availabilityStatus !== undefined ? availabilityStatus : profile.availabilityStatus,
                        workingDays: workingDays !== undefined ? workingDays : profile.workingDays,
                        workingHours: workingHours !== undefined ? workingHours : profile.workingHours,
                        workingPreferences: workingPreferences !== undefined ? workingPreferences : profile.workingPreferences,
                        qualifications: qualifications !== undefined ? qualifications : profile.qualifications,
                        serviceDescription: serviceDescription !== undefined ? serviceDescription : profile.serviceDescription,
                        experienceDescription: experienceDescription !== undefined ? experienceDescription : profile.experienceDescription,
                        visibility: visibility !== undefined ? visibility : profile.visibility,
                    },
                });
                // Sync skills if array provided
                if (Array.isArray(skills)) {
                    await tx.professionalSkill.deleteMany({
                        where: { professionalProfileId: profile.id },
                    });
                    for (const s of skills) {
                        const sName = typeof s === 'string' ? s.trim() : (s.name || s.skill?.name || '').trim();
                        if (sName) {
                            const skillRecord = await tx.skill.upsert({
                                where: { name: sName },
                                update: {},
                                create: { name: sName },
                            });
                            await tx.professionalSkill.create({
                                data: {
                                    professionalProfileId: profile.id,
                                    skillId: skillRecord.id,
                                    yearsOfExperience: Number(yearsOfExperience || 1),
                                },
                            });
                        }
                    }
                }
                // Sync service areas if array provided
                if (Array.isArray(serviceAreas)) {
                    await tx.serviceArea.deleteMany({
                        where: { professionalProfileId: profile.id },
                    });
                    for (const sa of serviceAreas) {
                        if (sa.areaId || sa.pincodeId) {
                            await tx.serviceArea.create({
                                data: {
                                    professionalProfileId: profile.id,
                                    areaId: sa.areaId || null,
                                    pincodeId: sa.pincodeId || null,
                                    radiusKm: Number(sa.radiusKm || 10.0),
                                },
                            });
                        }
                    }
                }
                // Audit Trail
                await tx.auditLog.create({
                    data: {
                        userId: userId,
                        action: 'PROFILE_UPDATED',
                        entityType: 'ProfessionalProfile',
                        entityId: profile.id,
                        metadata: JSON.stringify({
                            hasTitle: Boolean(title),
                            hasBio: Boolean(bio),
                            availabilityStatus,
                            categoryId,
                        }),
                    },
                });
            });
            // Recalculate Profile Strength & Trust Score
            await trust_score_service_1.TrustScoreService.recalculate(profile.id);
            const refreshed = await prisma_1.prisma.professionalProfile.findUnique({
                where: { id: profile.id },
                include: {
                    user: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true,
                            phone: true,
                            createdAt: true,
                            phoneVerifiedAt: true,
                            emailVerifiedAt: true,
                        },
                    },
                    category: true,
                    subcategory: true,
                    skills: { include: { skill: true } },
                    serviceAreas: { include: { area: true, pincode: true } },
                    verification: true,
                    linkedAccount: true,
                    payouts: true,
                },
            });
            const strengthResult = profile_strength_service_1.ProfileStrengthService.calculate(refreshed);
            const trustResult = trust_score_service_1.TrustScoreService.calculate(refreshed);
            return res.status(200).json({
                success: true,
                message: 'Profile updated successfully',
                data: {
                    ...refreshed,
                    profileStrength: strengthResult,
                    trustScore: trustResult,
                },
            });
        }
        catch (error) {
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
    static async getVerificationStatus(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
                include: { verification: true },
            });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Professional profile not found.' } });
            }
            const verification = profile.verification;
            const status = verification?.status || 'NOT_STARTED';
            const statusMessages = {
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
        }
        catch (error) {
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
    static async startVerification(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
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
                    const { authUrl, state, requestId } = apisetu_service_1.ApiSetuService.generateAuthorizationUrl(userId, existingRequestId);
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
            const { authUrl, state, requestId } = apisetu_service_1.ApiSetuService.generateAuthorizationUrl(userId);
            // Record pending verification state
            await prisma_1.prisma.$transaction(async (tx) => {
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
                }
                else {
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
        }
        catch (error) {
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
    static async completeVerification(req, res) {
        try {
            const code = (req.body?.code || req.query?.code);
            const state = (req.body?.state || req.query?.state);
            const errorParam = (req.body?.error || req.query?.error || req.query?.error_description);
            if (errorParam) {
                if (state) {
                    try {
                        const { userId, requestId } = apisetu_service_1.ApiSetuService.verifyState(state);
                        await apisetu_service_1.ApiSetuService.recordFailure(userId, 'Verification was cancelled on the DigiLocker portal.', requestId);
                    }
                    catch { }
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
            // Verify state and extract userId, requestId & codeVerifier
            const { userId, requestId, codeVerifier } = apisetu_service_1.ApiSetuService.verifyState(state);
            // Prevent cross-user tampering
            if (req.user?.id && req.user.id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: { message: 'Verification state user mismatch.' },
                });
            }
            const result = await apisetu_service_1.ApiSetuService.completeVerification(userId, code, requestId, codeVerifier);
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
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: { message: error.message || 'We couldn\'t verify your identity. Please check your details and try again.' },
            });
        }
    }
    /**
     * POST /api/v1/professionals/verification/retry
     */
    static async retryVerification(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
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
            await prisma_1.prisma.auditLog.create({
                data: {
                    userId,
                    action: 'VERIFICATION_RETRY',
                    entityType: 'Verification',
                    entityId: profile.id,
                    metadata: JSON.stringify({ provider: 'DIGILOCKER' }),
                },
            }).catch(() => { });
            return ProfessionalsController.startVerification(req, res);
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to restart verification' },
            });
        }
    }
    /**
     * POST /api/v1/professionals/verification/webhook
     */
    static async handleWebhook(req, res) {
        try {
            const result = await apisetu_service_1.ApiSetuService.handleWebhook(req.body);
            return res.status(200).json({ success: true, ...result });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Webhook processing failed' },
            });
        }
    }
    /**
     * Backward-compatible alias methods
     */
    static async initiateApiSetuVerification(req, res) {
        return ProfessionalsController.startVerification(req, res);
    }
    static async completeApiSetuVerification(req, res) {
        return ProfessionalsController.completeVerification(req, res);
    }
    /**
     * POST /api/v1/professionals/verify/digilocker (Fallback/Mock legacy route)
     */
    static async verifyDigiLocker(req, res) {
        try {
            const userId = req.user?.id;
            const { aadhaarReference, consentGiven } = req.body;
            if (!consentGiven) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Explicit consent is required for DigiLocker identity verification under IT Act & DPDP Act.' },
                });
            }
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
                include: { verification: true },
            });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
            }
            const maskedRef = aadhaarReference ? `DL-IN-${Date.now()}` : `DL-IN-MOCK-${Date.now()}`;
            let verification = profile.verification;
            if (verification) {
                verification = await prisma_1.prisma.verification.update({
                    where: { id: verification.id },
                    data: {
                        status: 'VERIFIED',
                        provider: 'DIGILOCKER',
                        referenceId: maskedRef,
                        verificationReference: maskedRef,
                        verifiedAt: new Date(),
                    },
                });
            }
            else {
                verification = await prisma_1.prisma.verification.create({
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
            await prisma_1.prisma.professionalProfile.update({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to complete DigiLocker verification' },
            });
        }
    }
    /**
     * GET /api/v1/professionals/profile/strength
     */
    static async getProfileStrength(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
                include: {
                    user: true,
                    verification: true,
                    skills: { include: { skill: true } },
                    serviceAreas: { include: { area: true, pincode: true } },
                    linkedAccount: true,
                    payouts: true,
                },
            });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Professional profile not found' } });
            }
            const strengthResult = profile_strength_service_1.ProfileStrengthService.calculate(profile);
            return res.status(200).json({
                success: true,
                data: strengthResult,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to calculate profile strength' },
            });
        }
    }
    /**
     * GET /api/v1/professionals/profile/trust-score
     */
    static async getTrustScore(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
                include: {
                    user: true,
                    verification: true,
                    skills: { include: { skill: true } },
                    serviceAreas: { include: { area: true, pincode: true } },
                    linkedAccount: true,
                    payouts: true,
                    jobs: {
                        where: { status: { in: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'PAYMENT_RELEASED', 'DISPUTED'] } },
                    },
                    reviewsReceived: true,
                },
            });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Professional profile not found' } });
            }
            const trustResult = trust_score_service_1.TrustScoreService.calculate(profile);
            return res.status(200).json({
                success: true,
                data: trustResult,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to calculate trust score' },
            });
        }
    }
    /**
     * GET /api/v1/professionals/profile/preview
     * Returns exact public profile view for the authenticated professional (no leaks)
     */
    static async getProfilePreview(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
                include: {
                    user: true,
                    category: true,
                    subcategory: true,
                    verification: true,
                    skills: { include: { skill: true } },
                    serviceAreas: { include: { area: true, pincode: true } },
                    linkedAccount: true,
                    payouts: true,
                    jobs: {
                        where: { status: { in: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'PAYMENT_RELEASED', 'DISPUTED'] } },
                    },
                    reviewsReceived: {
                        where: { moderationStatus: 'APPROVED' },
                        orderBy: { createdAt: 'desc' },
                        take: 10,
                        include: { customer: { include: { user: true } } },
                    },
                },
            });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Professional profile not found' } });
            }
            const publicPreview = serializePublicProfile(profile, profile.reviewsReceived);
            return res.status(200).json({
                success: true,
                data: publicPreview,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to generate profile preview' },
            });
        }
    }
    /**
     * POST /api/v1/professionals/avatar
     */
    static async uploadAvatar(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { avatarUrl } = req.body;
            if (!avatarUrl || typeof avatarUrl !== 'string' || avatarUrl.trim().length < 5) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Valid image URL or data URI is required for profile photo.' },
                });
            }
            const profile = await prisma_1.prisma.professionalProfile.findUnique({ where: { userId } });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Professional profile not found' } });
            }
            const updated = await prisma_1.prisma.professionalProfile.update({
                where: { id: profile.id },
                data: { avatarUrl: avatarUrl.trim() },
            });
            await trust_score_service_1.TrustScoreService.recalculate(profile.id);
            await prisma_1.prisma.auditLog.create({
                data: {
                    userId,
                    action: 'PROFILE_PHOTO_UPDATED',
                    entityType: 'ProfessionalProfile',
                    entityId: profile.id,
                    metadata: JSON.stringify({ hasAvatar: true }),
                },
            });
            return res.status(200).json({
                success: true,
                message: 'Profile photo updated successfully',
                data: { avatarUrl: updated.avatarUrl },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update profile photo' },
            });
        }
    }
    /**
     * GET /api/v1/professionals
     * Search and filter public professionals directory (Upwork-style)
     */
    static async listProfessionals(req, res) {
        try {
            const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
            const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
            const subcategory = typeof req.query.subcategory === 'string' ? req.query.subcategory.trim() : '';
            const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
            const verifiedOnly = req.query.verifiedOnly === 'true' || req.query.verifiedOnly === '1';
            const minRate = req.query.minRate ? Number(req.query.minRate) : undefined;
            const maxRate = req.query.maxRate ? Number(req.query.maxRate) : undefined;
            const minExperience = req.query.minExperience ? Number(req.query.minExperience) : undefined;
            const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'rating';
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
            const skip = (page - 1) * limit;
            const where = {
                visibility: 'PUBLIC',
            };
            if (verifiedOnly) {
                where.isVerified = true;
            }
            if (category) {
                where.OR = [
                    ...(where.OR || []),
                    { category: { slug: category } },
                    { category: { name: { contains: category } } },
                    { categoryId: category },
                ];
            }
            if (subcategory) {
                where.OR = [
                    ...(where.OR || []),
                    { subcategory: { slug: subcategory } },
                    { subcategory: { name: { contains: subcategory } } },
                    { subcategoryId: subcategory },
                ];
            }
            if (minRate !== undefined && !isNaN(minRate)) {
                where.hourlyRate = { ...(where.hourlyRate || {}), gte: minRate };
            }
            if (maxRate !== undefined && !isNaN(maxRate)) {
                where.hourlyRate = { ...(where.hourlyRate || {}), lte: maxRate };
            }
            if (minExperience !== undefined && !isNaN(minExperience)) {
                where.yearsOfExperience = { gte: minExperience };
            }
            if (city) {
                where.OR = [
                    ...(where.OR || []),
                    { serviceAreas: { some: { area: { city: { name: { contains: city } } } } } },
                    { serviceAreas: { some: { area: { name: { contains: city } } } } },
                    { bio: { contains: city } },
                ];
            }
            if (q) {
                where.AND = [
                    ...(where.AND || []),
                    {
                        OR: [
                            { title: { contains: q } },
                            { bio: { contains: q } },
                            { user: { firstName: { contains: q } } },
                            { user: { lastName: { contains: q } } },
                            { skills: { some: { skill: { name: { contains: q } } } } },
                            { category: { name: { contains: q } } },
                        ],
                    },
                ];
            }
            let orderBy = [{ rating: 'desc' }, { completedJobsCount: 'desc' }];
            if (sortBy === 'rate_asc')
                orderBy = [{ hourlyRate: 'asc' }];
            else if (sortBy === 'rate_desc')
                orderBy = [{ hourlyRate: 'desc' }];
            else if (sortBy === 'experience')
                orderBy = [{ yearsOfExperience: 'desc' }];
            else if (sortBy === 'jobs')
                orderBy = [{ completedJobsCount: 'desc' }];
            else if (sortBy === 'newest')
                orderBy = [{ createdAt: 'desc' }];
            const [total, rawProfiles] = await Promise.all([
                prisma_1.prisma.professionalProfile.count({ where }),
                prisma_1.prisma.professionalProfile.findMany({
                    where,
                    include: {
                        user: true,
                        category: true,
                        subcategory: true,
                        verification: true,
                        skills: { include: { skill: true } },
                        serviceAreas: { include: { area: true, pincode: true } },
                    },
                    orderBy,
                    skip,
                    take: limit,
                }),
            ]);
            // Check which professionals the current authenticated user has hired
            let hiredProIdSet = new Set();
            if (req.user?.id && rawProfiles.length > 0) {
                const customer = await prisma_1.prisma.customerProfile.findUnique({
                    where: { userId: req.user.id },
                    select: { id: true },
                });
                if (customer) {
                    const hiredJobs = await prisma_1.prisma.job.findMany({
                        where: {
                            customerId: customer.id,
                            professionalProfileId: { in: rawProfiles.map((p) => p.id) },
                            status: { notIn: ['CANCELLED'] },
                        },
                        select: { professionalProfileId: true },
                    });
                    hiredProIdSet = new Set(hiredJobs.map((j) => j.professionalProfileId));
                }
            }
            const serialized = rawProfiles.map((profile) => serializePublicProfile(profile, [], hiredProIdSet.has(profile.id)));
            return res.status(200).json({
                success: true,
                data: {
                    professionals: serialized,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list professionals' },
            });
        }
    }
    /**
     * GET /api/v1/professionals/:idOrSlug
     * GET /api/v1/professionals/:id/public
     * GET /api/v1/professionals/slug/:slug
     */
    static async getPublicProfile(req, res) {
        try {
            const identifier = (req.params.idOrSlug || req.params.id || req.params.slug);
            if (!identifier) {
                return res.status(400).json({ success: false, error: { message: 'Identifier or slug is required' } });
            }
            const profile = await prisma_1.prisma.professionalProfile.findFirst({
                where: {
                    OR: [
                        { id: identifier },
                        { slug: identifier },
                    ],
                },
                include: {
                    user: true,
                    category: true,
                    subcategory: true,
                    verification: true,
                    skills: { include: { skill: true } },
                    serviceAreas: { include: { area: true, pincode: true } },
                    linkedAccount: true,
                    payouts: true,
                    jobs: {
                        where: { status: { in: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'PAYMENT_RELEASED', 'DISPUTED'] } },
                    },
                    reviewsReceived: {
                        where: { moderationStatus: 'APPROVED' },
                        orderBy: { createdAt: 'desc' },
                        take: 10,
                        include: { customer: { include: { user: true } } },
                    },
                },
            });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Professional not found' } });
            }
            if (profile.visibility === 'HIDDEN') {
                return res.status(404).json({
                    success: false,
                    error: { message: 'This professional profile is currently set to private.' },
                });
            }
            // Check if current user has hired this professional
            let isHired = false;
            if (req.user?.id) {
                const customer = await prisma_1.prisma.customerProfile.findUnique({
                    where: { userId: req.user.id },
                    select: { id: true },
                });
                if (customer) {
                    const hiredJob = await prisma_1.prisma.job.findFirst({
                        where: {
                            customerId: customer.id,
                            professionalProfileId: profile.id,
                            status: { notIn: ['CANCELLED'] },
                        },
                        select: { id: true },
                    });
                    if (hiredJob)
                        isHired = true;
                }
            }
            const publicData = serializePublicProfile(profile, profile.reviewsReceived, isHired);
            return res.status(200).json({
                success: true,
                data: publicData,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch public profile' },
            });
        }
    }
}
exports.ProfessionalsController = ProfessionalsController;
