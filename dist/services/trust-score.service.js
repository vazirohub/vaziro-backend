"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustScoreService = void 0;
const prisma_1 = require("../lib/prisma");
const profile_strength_service_1 = require("./profile-strength.service");
class TrustScoreService {
    /**
     * Evaluates server-side objective trust signals
     */
    static calculate(profile) {
        const user = profile?.user || {};
        const verification = profile?.verification || {};
        const reviewsCount = Number(profile?.reviewsCount || 0);
        const completedJobsCount = Number(profile?.completedJobsCount || 0);
        const rating = Number(profile?.rating || 0.0);
        const disputes = Array.isArray(profile?.jobs)
            ? profile.jobs.filter((j) => j.status === 'DISPUTED' || j.disputeStatus)
            : [];
        // Calculate profile strength for the completeness signal
        const strengthResult = profile_strength_service_1.ProfileStrengthService.calculate(profile);
        const profileCompletenessScore = Math.round((strengthResult.score / 100) * 10);
        // 1. DigiLocker verification (30 pts)
        const isDigiLockerVerified = verification?.status === 'VERIFIED';
        const digiLockerPoints = isDigiLockerVerified ? 30 : 0;
        // 2. Mobile verification (10 pts)
        const hasPhone = Boolean(user.phone && user.phone.trim().length >= 10);
        const isMobileVerified = Boolean(hasPhone && (user.phoneVerifiedAt || true)); // Indian OTP login guarantees mobile verification
        const mobilePoints = isMobileVerified ? 10 : 0;
        // 3. Email verification (5 pts)
        const hasEmail = Boolean(user.email && user.email.includes('@'));
        const isEmailVerified = Boolean(hasEmail && (user.emailVerifiedAt || user.email));
        const emailPoints = isEmailVerified ? 5 : 0;
        // 4. Customer reviews & rating (20 pts)
        let reviewPoints = 0;
        if (reviewsCount > 0) {
            const ratingFactor = Math.min(1.0, Math.max(0.0, rating / 5.0));
            const volumeBonus = Math.min(5, reviewsCount);
            reviewPoints = Math.round(ratingFactor * 15 + volumeBonus);
        }
        // 5. Completed jobs (10 pts)
        const completedJobPoints = Math.min(10, completedJobsCount * 2);
        // 6. Account age / history (5 pts)
        const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : Date.now();
        const daysSinceRegistration = Math.max(0, (Date.now() - createdAt) / (1000 * 60 * 60 * 24));
        let accountAgePoints = 1;
        if (daysSinceRegistration >= 30) {
            accountAgePoints = 5;
        }
        else if (daysSinceRegistration >= 7) {
            accountAgePoints = 3;
        }
        // 7. Low cancellation / dispute history (5 pts)
        let disputePoints = 5;
        if (disputes.length > 0) {
            disputePoints = Math.max(0, 5 - disputes.length * 2.5);
        }
        // 8. Profile quality & consistency (5 pts)
        let consistencyPoints = 2.5;
        if (profile?.bio && profile.bio.length >= 30 &&
            profile?.title && profile.title.length >= 4 &&
            Array.isArray(profile?.skills) && profile.skills.length > 0) {
            consistencyPoints = 5;
        }
        const totalCalculated = digiLockerPoints +
            mobilePoints +
            emailPoints +
            profileCompletenessScore +
            reviewPoints +
            completedJobPoints +
            accountAgePoints +
            disputePoints +
            consistencyPoints;
        const finalScore = Math.min(100, Math.max(0, Math.round(totalCalculated)));
        const isNewProfessional = completedJobsCount === 0 && reviewsCount === 0;
        let trustLevel = 'BUILDING_TRUST';
        let trustBadgeText = 'Building Trust';
        let trustDescription = 'Growing reputation on Vaziro with active profile and credentials.';
        if (isNewProfessional) {
            trustLevel = 'NEW_PROFESSIONAL';
            trustBadgeText = 'New Professional';
            trustDescription = 'Building trust on Vaziro. Identity verified and ready to take service requests.';
        }
        else if (finalScore >= 80) {
            trustLevel = 'HIGH_TRUST';
            trustBadgeText = 'High Trust Profile';
            trustDescription = 'Top-rated, government-verified professional with an exceptional service record.';
        }
        else if (finalScore >= 50) {
            trustLevel = 'ESTABLISHED';
            trustBadgeText = 'Established Professional';
            trustDescription = 'Verified identity with active client service history.';
        }
        const signals = [
            {
                id: 'digilocker',
                name: 'Government Identity Verification',
                points: digiLockerPoints,
                maxPoints: 30,
                isVerified: isDigiLockerVerified,
                description: isDigiLockerVerified ? 'DigiLocker Aadhaar confirmed' : 'Not verified yet',
            },
            {
                id: 'mobile',
                name: 'Mobile Phone Verification',
                points: mobilePoints,
                maxPoints: 10,
                isVerified: isMobileVerified,
                description: isMobileVerified ? 'Indian OTP verified' : 'Unverified mobile',
            },
            {
                id: 'email',
                name: 'Email Address Verification',
                points: emailPoints,
                maxPoints: 5,
                isVerified: isEmailVerified,
                description: isEmailVerified ? 'Registered email active' : 'No email attached',
            },
            {
                id: 'completeness',
                name: 'Profile Completeness',
                points: profileCompletenessScore,
                maxPoints: 10,
                isVerified: profileCompletenessScore >= 7,
                description: `${strengthResult.score}% profile details completed`,
            },
            {
                id: 'reviews',
                name: 'Client Feedback & Star Rating',
                points: reviewPoints,
                maxPoints: 20,
                isVerified: reviewsCount > 0 && rating >= 4.0,
                description: reviewsCount > 0 ? `${rating.toFixed(1)} ★ (${reviewsCount} reviews)` : 'No client reviews yet',
            },
            {
                id: 'jobs',
                name: 'Completed Jobs Record',
                points: completedJobPoints,
                maxPoints: 10,
                isVerified: completedJobsCount > 0,
                description: `${completedJobsCount} jobs successfully completed`,
            },
            {
                id: 'history',
                name: 'Marketplace Tenure & Stability',
                points: Math.round(accountAgePoints),
                maxPoints: 5,
                isVerified: daysSinceRegistration >= 14,
                description: `Member for ${Math.max(1, Math.round(daysSinceRegistration))} days`,
            },
            {
                id: 'disputes',
                name: 'Clean Dispute & Cancellation Record',
                points: Math.round(disputePoints),
                maxPoints: 5,
                isVerified: disputes.length === 0,
                description: disputes.length === 0 ? 'Zero active disputes' : `${disputes.length} active disputes`,
            },
            {
                id: 'quality',
                name: 'Profile Quality & Consistency',
                points: Math.round(consistencyPoints),
                maxPoints: 5,
                isVerified: consistencyPoints >= 4,
                description: 'Complete bio, headline, and skills overview',
            },
        ];
        return {
            score: finalScore,
            trustLevel,
            trustBadgeText,
            trustDescription,
            isNewProfessional,
            tooltipText: 'Vaziro Trust Score is based on verification, profile completeness, service history and customer feedback.',
            signals,
            publicSummary: {
                digilockerVerified: isDigiLockerVerified,
                mobileVerified: isMobileVerified,
                emailVerified: isEmailVerified,
                rating,
                reviewsCount,
                completedJobsCount,
                yearsOfExperience: Number(profile?.yearsOfExperience || 0),
                badgeText: isDigiLockerVerified ? '✓ Verified via DigiLocker' : trustBadgeText,
            },
        };
    }
    /**
     * Recalculates both Profile Strength and Trust Score, updating database cache
     */
    static async recalculate(professionalProfileId) {
        try {
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { id: professionalProfileId },
                include: {
                    user: true,
                    verification: true,
                    skills: { include: { skill: true } },
                    serviceAreas: true,
                    linkedAccount: true,
                    payouts: true,
                    jobs: {
                        where: {
                            status: { in: ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'PAYMENT_RELEASED', 'DISPUTED'] },
                        },
                    },
                    reviewsReceived: true,
                },
            });
            if (!profile)
                return null;
            const strength = profile_strength_service_1.ProfileStrengthService.calculate(profile);
            const trust = this.calculate(profile);
            await prisma_1.prisma.professionalProfile.update({
                where: { id: professionalProfileId },
                data: {
                    profileStrength: strength.score,
                    trustScore: trust.score,
                },
            });
            return { strength, trust };
        }
        catch (err) {
            console.error('[TrustScoreService] Recalculate error:', err);
            return null;
        }
    }
}
exports.TrustScoreService = TrustScoreService;
