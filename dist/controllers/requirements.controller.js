"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequirementsController = void 0;
const prisma_1 = require("../lib/prisma");
const credit_service_1 = require("../services/credit.service");
class RequirementsController {
    /**
     * POST /api/v1/requirements
     */
    static async createRequirement(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const { categoryId, subcategoryId, title, description, budgetType, // FIXED or RANGE
            minimumBudget, maximumBudget, budgetMin, budgetMax, stateId, cityId, areaId, pincode, pincodeId, preferredDate, preferredTime, timeline, frequency, experienceRequirement, genderPreference, specialInstructions, } = req.body;
            const effectiveMin = budgetMin !== undefined ? Number(budgetMin) : Number(minimumBudget);
            const effectiveMax = budgetMax !== undefined ? Number(budgetMax) : (maximumBudget !== undefined ? Number(maximumBudget) : effectiveMin);
            const effectivePincodeId = pincodeId || pincode;
            if (!categoryId || !subcategoryId || !title || !description || !effectiveMin) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Missing required fields: categoryId, subcategoryId, title, description, and budget are mandatory.' },
                });
            }
            if (budgetType === 'RANGE' && effectiveMax < effectiveMin) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'For budget range, maximum budget must be greater than or equal to minimum budget.' },
                });
            }
            // 1. Resolve Category
            let validCategoryId = categoryId;
            const existingCat = await prisma_1.prisma.category.findUnique({ where: { id: categoryId } });
            if (!existingCat) {
                const cleanCat = String(categoryId).replace(/^cat-/, '').toLowerCase();
                const foundCat = await prisma_1.prisma.category.findFirst({
                    where: {
                        OR: [
                            { slug: cleanCat },
                            { name: { contains: cleanCat } },
                        ],
                    },
                });
                if (foundCat) {
                    validCategoryId = foundCat.id;
                }
                else {
                    const firstCat = await prisma_1.prisma.category.findFirst({ where: { isActive: true } });
                    if (firstCat)
                        validCategoryId = firstCat.id;
                }
            }
            // 2. Resolve Subcategory
            let validSubcategoryId = subcategoryId;
            const existingSub = await prisma_1.prisma.subcategory.findUnique({ where: { id: subcategoryId } });
            if (!existingSub) {
                const cleanSub = String(subcategoryId).replace(/^sub-/, '').toLowerCase();
                const foundSub = await prisma_1.prisma.subcategory.findFirst({
                    where: {
                        categoryId: validCategoryId,
                        OR: [
                            { slug: cleanSub },
                            { name: { contains: cleanSub } },
                        ],
                    },
                });
                if (foundSub) {
                    validSubcategoryId = foundSub.id;
                }
                else {
                    const firstSub = await prisma_1.prisma.subcategory.findFirst({
                        where: { categoryId: validCategoryId, isActive: true },
                    });
                    if (firstSub)
                        validSubcategoryId = firstSub.id;
                }
            }
            // 3. Resolve City
            let validCityId = null;
            if (cityId) {
                const existingCity = await prisma_1.prisma.city.findUnique({ where: { id: cityId } });
                if (existingCity) {
                    validCityId = existingCity.id;
                }
                else {
                    const cleanCity = String(cityId).replace(/^city-/, '').toLowerCase();
                    const foundCity = await prisma_1.prisma.city.findFirst({
                        where: {
                            OR: [
                                { slug: cleanCity },
                                { name: { contains: cleanCity } },
                            ],
                        },
                    });
                    if (foundCity) {
                        validCityId = foundCity.id;
                    }
                }
            }
            if (!validCityId) {
                const defaultCity = await prisma_1.prisma.city.findFirst({
                    where: {
                        OR: [
                            { slug: 'delhi' },
                            { name: 'Delhi' },
                            { slug: 'new-delhi' },
                        ],
                    },
                });
                validCityId = defaultCity ? defaultCity.id : null;
            }
            // 4. Resolve State
            let validStateId = null;
            if (stateId) {
                const existingState = await prisma_1.prisma.state.findUnique({ where: { id: stateId } });
                if (existingState)
                    validStateId = existingState.id;
            }
            if (!validStateId && validCityId) {
                const cityWithState = await prisma_1.prisma.city.findUnique({
                    where: { id: validCityId },
                    select: { stateId: true },
                });
                if (cityWithState)
                    validStateId = cityWithState.stateId;
            }
            // 5. Resolve Pincode
            let validPincodeId = null;
            if (effectivePincodeId) {
                const pinRecord = await prisma_1.prisma.pincode.findFirst({
                    where: { pincode: String(effectivePincodeId) },
                });
                validPincodeId = pinRecord ? pinRecord.id : null;
            }
            // 6. Create or update CustomerProfile with validated foreign keys
            let customerProfile = await prisma_1.prisma.customerProfile.findUnique({
                where: { userId },
            });
            if (!customerProfile) {
                customerProfile = await prisma_1.prisma.customerProfile.create({
                    data: {
                        userId,
                        cityId: validCityId,
                        pincodeId: validPincodeId,
                    },
                });
            }
            // Check for duplicate / retry submission within last 3 minutes by same customer
            const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
            const existingDuplicate = await prisma_1.prisma.requirement.findFirst({
                where: {
                    customerId: customerProfile.id,
                    title: title.trim(),
                    description: description.trim(),
                    createdAt: { gte: threeMinutesAgo },
                },
                include: {
                    category: true,
                    subcategory: true,
                    city: true,
                },
            });
            if (existingDuplicate) {
                const creditCost = await credit_service_1.CreditService.calculateFee(existingDuplicate.budgetMin, existingDuplicate.budgetMax);
                return res.status(200).json({
                    success: true,
                    message: 'Requirement already published.',
                    data: {
                        ...existingDuplicate,
                        creditCost,
                    },
                });
            }
            const requirement = await prisma_1.prisma.requirement.create({
                data: {
                    customerId: customerProfile.id,
                    categoryId: validCategoryId,
                    subcategoryId: validSubcategoryId,
                    title,
                    description,
                    budgetType: budgetType || 'FIXED',
                    budgetMin: effectiveMin,
                    budgetMax: effectiveMax,
                    currency: 'INR',
                    stateId: validStateId,
                    cityId: validCityId,
                    areaId: null,
                    pincodeId: validPincodeId,
                    preferredDate: preferredDate ? new Date(preferredDate) : null,
                    preferredTime: preferredTime || null,
                    timeline: timeline || 'ASAP',
                    frequency: frequency || 'ONE_TIME',
                    experienceRequirement: experienceRequirement || null,
                    genderPreference: genderPreference || 'NO_PREFERENCE',
                    specialInstructions: specialInstructions || null,
                    status: 'RECEIVING_QUOTES',
                },
                include: {
                    category: true,
                    subcategory: true,
                    city: true,
                },
            });
            await prisma_1.prisma.customerProfile.update({
                where: { id: customerProfile.id },
                data: { jobsPostedCount: { increment: 1 } },
            });
            const creditCost = await credit_service_1.CreditService.calculateFee(requirement.budgetMin, requirement.budgetMax);
            return res.status(201).json({
                success: true,
                message: 'Requirement posted successfully. Service professionals in your area are being notified.',
                data: {
                    ...requirement,
                    creditCost,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to post requirement' },
            });
        }
    }
    /**
     * GET /api/v1/requirements
     */
    static async listRequirements(req, res) {
        try {
            const { categoryId, subcategoryId, cityId, pincode, status } = req.query;
            const whereClause = {};
            if (categoryId)
                whereClause.categoryId = String(categoryId);
            if (subcategoryId)
                whereClause.subcategoryId = String(subcategoryId);
            if (cityId)
                whereClause.cityId = String(cityId);
            if (status) {
                whereClause.status = String(status);
            }
            else {
                whereClause.status = { in: ['PUBLISHED', 'RECEIVING_QUOTES'] };
            }
            const requirements = await prisma_1.prisma.requirement.findMany({
                where: whereClause,
                include: {
                    category: true,
                    subcategory: true,
                    city: true,
                    pincode: true,
                    customer: {
                        include: {
                            user: {
                                select: { firstName: true, createdAt: true },
                            },
                        },
                    },
                    _count: {
                        select: {
                            applications: true,
                            quotations: true,
                        },
                    },
                },
                orderBy: [
                    { boostPriority: 'desc' },
                    { createdAt: 'desc' },
                ],
            });
            const now = new Date();
            const enriched = await Promise.all(requirements.map(async (item) => {
                const creditsRequired = await credit_service_1.CreditService.calculateFee(item.budgetMin, item.budgetMax);
                const isBoostActive = Boolean(item.isBoosted && item.boostExpiresAt && new Date(item.boostExpiresAt) > now);
                const cleanPincode = item.pincode?.pincode || (item.pincodeId && item.pincodeId.length === 6 && !item.pincodeId.includes('-') ? item.pincodeId : null);
                return {
                    ...item,
                    pincodeId: cleanPincode,
                    pincode: cleanPincode,
                    isBoosted: isBoostActive,
                    boostPriority: isBoostActive ? item.boostPriority : 0,
                    minimumBudget: item.budgetMin,
                    maximumBudget: item.budgetMax,
                    creditsRequired,
                    customerTrust: {
                        firstName: item.customer.user.firstName,
                        jobsPostedCount: item.customer.jobsPostedCount,
                        jobsCompletedCount: item.customer.jobsCompletedCount,
                        memberSince: item.customer.user.createdAt,
                        trustScore: item.customer.trustScore,
                    },
                };
            }));
            return res.status(200).json({
                success: true,
                data: enriched,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to retrieve requirements' },
            });
        }
    }
    /**
     * GET /api/v1/requirements/my
     */
    static async getMyRequirements(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const customer = await prisma_1.prisma.customerProfile.findUnique({
                where: { userId },
            });
            if (!customer) {
                return res.status(200).json({ success: true, data: [] });
            }
            const requirements = await prisma_1.prisma.requirement.findMany({
                where: { customerId: customer.id },
                include: {
                    category: true,
                    subcategory: true,
                    city: true,
                    pincode: true,
                    _count: {
                        select: { quotations: true, applications: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            return res.status(200).json({
                success: true,
                data: requirements.map((r) => {
                    const cleanPincode = r.pincode?.pincode || (r.pincodeId && r.pincodeId.length === 6 && !r.pincodeId.includes('-') ? r.pincodeId : null);
                    return {
                        ...r,
                        pincodeId: cleanPincode,
                        pincode: cleanPincode,
                        minimumBudget: r.budgetMin,
                        maximumBudget: r.budgetMax,
                    };
                }),
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch customer requirements' },
            });
        }
    }
    /**
     * GET /api/v1/requirements/:id
     */
    static async getRequirementById(req, res) {
        try {
            const { id } = req.params;
            const requirement = await prisma_1.prisma.requirement.findUnique({
                where: { id },
                include: {
                    category: true,
                    subcategory: true,
                    city: true,
                    pincode: true,
                    customer: {
                        include: {
                            user: {
                                select: { firstName: true, createdAt: true },
                            },
                        },
                    },
                    attachments: true,
                    _count: {
                        select: { applications: true, quotations: true },
                    },
                },
            });
            if (!requirement) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Requirement not found' },
                });
            }
            const creditsRequired = await credit_service_1.CreditService.calculateFee(requirement.budgetMin, requirement.budgetMax);
            const now = new Date();
            const isBoostActive = Boolean(requirement.isBoosted && requirement.boostExpiresAt && new Date(requirement.boostExpiresAt) > now);
            const cleanPincode = requirement.pincode?.pincode || (requirement.pincodeId && requirement.pincodeId.length === 6 && !requirement.pincodeId.includes('-') ? requirement.pincodeId : null);
            return res.status(200).json({
                success: true,
                data: {
                    ...requirement,
                    pincodeId: cleanPincode,
                    pincode: cleanPincode,
                    isBoosted: isBoostActive,
                    boostPriority: isBoostActive ? requirement.boostPriority : 0,
                    minimumBudget: requirement.budgetMin,
                    maximumBudget: requirement.budgetMax,
                    creditsRequired,
                    customerTrust: {
                        firstName: requirement.customer.user.firstName,
                        jobsPostedCount: requirement.customer.jobsPostedCount,
                        jobsCompletedCount: requirement.customer.jobsCompletedCount,
                        memberSince: requirement.customer.user.createdAt,
                        trustScore: requirement.customer.trustScore,
                    },
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch requirement detail' },
            });
        }
    }
    /**
     * PATCH /api/v1/requirements/:id/status
     */
    static async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const userId = req.user?.id;
            const allowedStatuses = ['CANCELLED', 'CLOSED'];
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: { message: `Invalid status update. Allowed: ${allowedStatuses.join(', ')}` },
                });
            }
            const requirement = await prisma_1.prisma.requirement.findUnique({
                where: { id },
                include: { customer: true },
            });
            if (!requirement) {
                return res.status(404).json({ success: false, error: { message: 'Requirement not found' } });
            }
            if (requirement.customer.userId !== userId && !req.user?.roles?.includes('ADMIN')) {
                return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
            }
            const updated = await prisma_1.prisma.requirement.update({
                where: { id },
                data: { status },
            });
            // Section 23: Automatic refund of all applicant credits when requirement is cancelled
            if (status === 'CANCELLED') {
                try {
                    await credit_service_1.CreditService.refundAllApplicationsForRequirement(id, 'CUSTOMER_CANCELLED');
                }
                catch (refundErr) {
                    console.error(`Failed to process credit refunds for cancelled requirement ${id}:`, refundErr);
                }
            }
            return res.status(200).json({
                success: true,
                message: `Requirement status updated to ${status}`,
                data: updated,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update requirement status' },
            });
        }
    }
    /**
     * DELETE /api/v1/requirements/:id
     * Allows customer owner or admin to delete/remove a posted requirement
     */
    static async deleteRequirement(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
            }
            const requirement = await prisma_1.prisma.requirement.findUnique({
                where: { id },
                include: { customer: true, jobs: true },
            });
            if (!requirement) {
                return res.status(404).json({ success: false, error: { message: 'Requirement not found' } });
            }
            const isAdmin = req.user?.roles?.some((r) => {
                const name = typeof r === 'string' ? r : r.name || r.role?.name;
                return name === 'ADMIN' || name === 'SUPER_ADMIN';
            });
            if (requirement.customer.userId !== userId && !isAdmin) {
                return res.status(403).json({ success: false, error: { message: 'Unauthorized to delete this requirement' } });
            }
            const hasActiveJobs = requirement.jobs?.some((j) => j.status !== 'CANCELLED' && j.status !== 'COMPLETED');
            if (hasActiveJobs) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Cannot delete requirement with active hired jobs. Please cancel the job first.' },
                });
            }
            // Refund candidates who spent credits
            await credit_service_1.CreditService.refundAllApplicationsForRequirement(id, 'REQUIREMENT_DELETED').catch(() => { });
            // Delete the requirement
            await prisma_1.prisma.requirement.delete({ where: { id } });
            // Decrement customer jobsPostedCount
            await prisma_1.prisma.customerProfile.update({
                where: { id: requirement.customerId },
                data: { jobsPostedCount: { decrement: 1 } },
            }).catch(() => { });
            return res.status(200).json({
                success: true,
                message: 'Requirement removed successfully.',
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to remove requirement' },
            });
        }
    }
}
exports.RequirementsController = RequirementsController;
