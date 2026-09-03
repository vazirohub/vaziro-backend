"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewsController = void 0;
const prisma_1 = require("../lib/prisma");
class ReviewsController {
    /**
     * POST /api/v1/reviews
     */
    static async createReview(req, res) {
        try {
            const userId = req.user?.id;
            const { jobId, rating, comment, tags } = req.body;
            if (!jobId || !rating || Number(rating) < 1 || Number(rating) > 5) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Valid jobId and rating between 1 and 5 are required.' },
                });
            }
            const job = await prisma_1.prisma.job.findUnique({
                where: { id: jobId },
                include: {
                    customer: true,
                    professional: true,
                    review: true,
                },
            });
            if (!job) {
                return res.status(404).json({ success: false, error: { message: 'Job not found' } });
            }
            if (job.customer.userId !== userId && !req.user?.roles.includes('ADMIN')) {
                return res.status(403).json({ success: false, error: { message: 'Only the customer can review this job.' } });
            }
            const eligibleStatuses = ['SERVICE_COMPLETED', 'CUSTOMER_APPROVED', 'PAYMENT_RELEASED', 'CLOSED'];
            if (!eligibleStatuses.includes(job.status)) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Reviews can only be submitted after service completion or approval.' },
                });
            }
            if (job.review) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'A review has already been submitted for this job.' },
                });
            }
            const result = await prisma_1.prisma.$transaction(async (tx) => {
                const review = await tx.review.create({
                    data: {
                        jobId: job.id,
                        customerId: job.customerId,
                        professionalProfileId: job.professionalProfileId,
                        rating: Number(rating),
                        comment: comment || '',
                        tags: tags && Array.isArray(tags) ? tags.join(',') : (tags || ''),
                        moderationStatus: 'APPROVED',
                    },
                });
                const allReviews = await tx.review.findMany({
                    where: { professionalProfileId: job.professionalProfileId, moderationStatus: 'APPROVED' },
                });
                const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
                const avgRating = allReviews.length > 0 ? Number((totalRating / allReviews.length).toFixed(1)) : 5.0;
                await tx.professionalProfile.update({
                    where: { id: job.professionalProfileId },
                    data: {
                        rating: avgRating,
                        reviewsCount: allReviews.length,
                    },
                });
                return review;
            });
            return res.status(201).json({
                success: true,
                message: 'Thank you! Your verified review has been published.',
                data: result,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to submit review' },
            });
        }
    }
    /**
     * GET /api/v1/reviews/professional/:id
     */
    static async getProfessionalReviews(req, res) {
        try {
            const { id } = req.params;
            const prof = await prisma_1.prisma.professionalProfile.findUnique({
                where: { id },
            });
            if (!prof) {
                return res.status(404).json({ success: false, error: { message: 'Professional not found' } });
            }
            const reviews = await prisma_1.prisma.review.findMany({
                where: { professionalProfileId: prof.id, moderationStatus: 'APPROVED' },
                include: {
                    customer: {
                        include: {
                            user: { select: { firstName: true, createdAt: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            return res.status(200).json({
                success: true,
                data: reviews.map((r) => ({
                    ...r,
                    reviewer: r.customer.user,
                })),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch reviews' },
            });
        }
    }
}
exports.ReviewsController = ReviewsController;
