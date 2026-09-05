"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIMatchService = void 0;
const gemini_service_1 = require("./gemini.service");
class AIMatchService {
    /**
     * Calculate AI recommendation match score and human-readable explanation
     */
    static calculateMatchScore(requirement, professional) {
        let score = 50; // baseline score
        const reasons = [];
        // 1. Category & Subcategory match (up to 25 pts)
        if (requirement.subcategoryId && professional.subcategoryId === requirement.subcategoryId) {
            score += 25;
            reasons.push(`Specialized expert in ${requirement.subcategory?.name || 'requested subcategory'}`);
        }
        else if (requirement.categoryId && professional.categoryId === requirement.categoryId) {
            score += 15;
            reasons.push(`Core experience in ${requirement.category?.name || 'requested category'}`);
        }
        // 2. Location & Pincode Proximity (up to 20 pts)
        if (requirement.pincode && professional.pincodes?.includes(requirement.pincode)) {
            score += 20;
            reasons.push(`Direct local service coverage in pincode ${requirement.pincode}`);
        }
        else if (requirement.cityId && professional.cityId === requirement.cityId) {
            score += 12;
            reasons.push(`Operates actively in ${requirement.city?.name || 'requested city'}`);
        }
        // 3. Verification & Trust Status (up to 15 pts)
        if (professional.isVerified) {
            score += 15;
            reasons.push('DigiLocker Govt-ID Verified Professional');
        }
        // 4. Rating & Track Record (up to 15 pts)
        if (professional.rating && professional.rating >= 4.5) {
            score += 15;
            reasons.push(`Top rated (${professional.rating.toFixed(1)}★) with ${professional.completedJobsCount || 0} completed jobs`);
        }
        else if (professional.completedJobsCount && professional.completedJobsCount > 5) {
            score += 10;
            reasons.push(`Proven track record with ${professional.completedJobsCount} successfully completed jobs`);
        }
        // 5. Budget Compatibility (up to 10 pts)
        const reqBudget = requirement.maximumBudget || requirement.minimumBudget;
        if (reqBudget && professional.hourlyRate) {
            if (professional.hourlyRate <= reqBudget) {
                score += 10;
                reasons.push('Quotation & pricing expectations align with your posted budget');
            }
        }
        else {
            score += 5;
        }
        // Clamp score between 60% and 99%
        const finalScore = Math.min(99, Math.max(60, Math.round(score)));
        let ratingGrade = 'MODERATE';
        if (finalScore >= 90)
            ratingGrade = 'EXCELLENT';
        else if (finalScore >= 80)
            ratingGrade = 'HIGH';
        else if (finalScore >= 70)
            ratingGrade = 'MODERATE';
        else
            ratingGrade = 'BASIC';
        return {
            score: finalScore,
            ratingGrade,
            reasons: reasons.slice(0, 3), // Return top 3 compelling reasons
        };
    }
    /**
     * Calculate match score enriched by Gemini AI with deterministic heuristic fallback
     */
    static async calculateMatchScoreWithGemini(requirement, professional, quotation) {
        const fallback = this.calculateMatchScore(requirement, professional);
        try {
            if (gemini_service_1.GeminiService.isAvailable()) {
                const geminiResult = await gemini_service_1.GeminiService.evaluateCandidateMatch(requirement, professional, quotation);
                if (geminiResult && geminiResult.reasons && geminiResult.reasons.length > 0) {
                    return {
                        score: geminiResult.score || fallback.score,
                        ratingGrade: geminiResult.ratingGrade || fallback.ratingGrade,
                        reasons: geminiResult.reasons.slice(0, 3),
                    };
                }
            }
        }
        catch (err) {
            console.warn('[AIMatchService] Gemini match evaluation fallback:', err.message);
        }
        return fallback;
    }
}
exports.AIMatchService = AIMatchService;
