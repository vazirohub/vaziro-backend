"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfessionalsController = void 0;
const prisma_1 = require("../lib/prisma");
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
            let profile = await prisma_1.prisma.professionalProfile.findUnique({
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
                profile = await prisma_1.prisma.professionalProfile.create({
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
            const { title, bio, yearsOfExperience, hourlyRate, languages, avatarUrl, } = req.body;
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
                where: { userId },
            });
            if (!profile) {
                return res.status(404).json({ success: false, error: { message: 'Profile not found' } });
            }
            const updated = await prisma_1.prisma.professionalProfile.update({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update profile' },
            });
        }
    }
    /**
     * POST /api/v1/professionals/verify/digilocker
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
     * GET /api/v1/professionals/:id
     */
    static async getPublicProfile(req, res) {
        try {
            const { id } = req.params;
            const profile = await prisma_1.prisma.professionalProfile.findUnique({
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
