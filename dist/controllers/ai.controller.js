"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIController = void 0;
const gemini_service_1 = require("../services/gemini.service");
const ai_match_service_1 = require("../services/ai-match.service");
const ai_support_service_1 = require("../services/ai-support.service");
const notification_service_1 = require("../services/notification.service");
class AIController {
    /**
     * POST /api/v1/ai/chat
     * Official AI Support Chat: Handles both general marketplace questions and secure account-specific queries
     */
    static async chat(req, res) {
        try {
            const { message, history } = req.body;
            // Validation
            if (!message || typeof message !== 'string' || message.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Message cannot be empty.' },
                });
            }
            if (message.length > 2000) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Message is too long. Please limit your question to 2,000 characters.' },
                });
            }
            // Check if user is authenticated
            const user = req.user;
            const userId = user?.id;
            const userRole = user?.roles?.[0] || 'CUSTOMER';
            const result = await ai_support_service_1.AISupportService.handleChatQuery({
                message: message.trim(),
                history: Array.isArray(history) ? history : [],
                userId,
                userRole,
            });
            return res.status(200).json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            console.error('[AIController] chat error:', error.message);
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to process AI chat request.' },
            });
        }
    }
    /**
     * POST /api/v1/ai/extract-requirement
     * Section 10 & 12: Natural language customer request to structured requirement JSON
     */
    static async extractRequirement(req, res) {
        try {
            const { text } = req.body;
            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Text input is required to extract requirement parameters.' },
                });
            }
            const extracted = await gemini_service_1.GeminiService.extractRequirementFromNaturalLanguage(text.trim());
            if (!extracted) {
                // Fallback extraction
                return res.status(200).json({
                    success: true,
                    data: {
                        category: 'General',
                        service: text.slice(0, 50).trim(),
                        location: 'India',
                        urgency: 'NORMAL',
                        requirements: [text.trim()],
                        isAIExtracted: false,
                    },
                });
            }
            return res.status(200).json({
                success: true,
                data: {
                    ...extracted,
                    isAIExtracted: true,
                },
            });
        }
        catch (error) {
            console.error('[AIController] extractRequirement error:', error.message);
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to extract requirement.' },
            });
        }
    }
    /**
     * POST /api/v1/ai/polish-requirement
     * Smart Requirement Assistant ("Help me describe")
     */
    static async polishRequirement(req, res) {
        try {
            const { categoryName, rawDescription, city } = req.body;
            if (!rawDescription || typeof rawDescription !== 'string' || rawDescription.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Please provide notes or draft details to polish.' },
                });
            }
            if (rawDescription.length > 3000) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Draft description is too long (maximum 3,000 characters).' },
                });
            }
            const result = await gemini_service_1.GeminiService.polishRequirement({
                categoryName: categoryName || 'Service',
                rawDescription: rawDescription.trim(),
                city: city || 'India',
            });
            if (!result) {
                return res.status(200).json({
                    success: true,
                    data: {
                        title: rawDescription.slice(0, 60).trim(),
                        description: rawDescription.trim(),
                        suggestedBudgetMin: 500,
                        suggestedBudgetMax: 2000,
                        timelineDays: 1,
                        isAIPolished: false,
                    },
                });
            }
            return res.status(200).json({
                success: true,
                data: {
                    ...result,
                    isAIPolished: true,
                },
            });
        }
        catch (error) {
            console.error('[AIController] polishRequirement error:', error.message);
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to polish requirement.' },
            });
        }
    }
    /**
     * POST /api/v1/ai/match-rationale
     * Candidate Match Evaluation
     */
    static async getMatchRationale(req, res) {
        try {
            const { requirement, professional, quotation } = req.body;
            if (!requirement || !professional) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Requirement and professional data are required.' },
                });
            }
            const match = await ai_match_service_1.AIMatchService.calculateMatchScoreWithGemini(requirement, professional, quotation);
            return res.status(200).json({
                success: true,
                data: match,
            });
        }
        catch (error) {
            console.error('[AIController] getMatchRationale error:', error.message);
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to calculate match rationale.' },
            });
        }
    }
    /**
     * GET /api/v1/ai/health
     * Section 6: Internal Gemini health diagnostic (Never exposes secrets)
     */
    static async healthCheck(_req, res) {
        try {
            const health = await gemini_service_1.GeminiService.healthCheck();
            const statusCode = health.status === 'HEALTHY' ? 200 : 503;
            return res.status(statusCode).json({
                success: health.status === 'HEALTHY',
                data: health,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: 'AI health check encountered an error.' },
            });
        }
    }
    /**
     * POST /api/v1/ai/request-callback
     * Handover from Isha AI to Human Support Executive.
     * Logs priority callback ticket and notifies info@vaziro.in immediately.
     */
    static async requestCallback(req, res) {
        try {
            const user = req.user;
            const { phone, name, email, notes, transcript } = req.body;
            const effectivePhone = phone?.trim() || user?.phone || '';
            const effectiveName = name?.trim() ||
                (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Guest Member');
            const effectiveEmail = email?.trim() || user?.email || '';
            if (!effectivePhone && !effectiveEmail) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Please provide a valid phone number or email for your callback.' },
                });
            }
            // Notify executive inbox info@vaziro.in
            notification_service_1.NotificationService.notifyAdminEvent({
                eventType: 'DISPUTE',
                title: `Priority Support Callback Request: ${effectiveName} (${effectivePhone || effectiveEmail})`,
                message: `A member has requested a priority callback through Isha Assistant.\n\nMember: ${effectiveName}\nPhone: ${effectivePhone}\nEmail: ${effectiveEmail}\nTopic/Notes: ${notes || 'Human Support Handover'}\n\nRecent Transcript:\n${transcript || 'N/A'}`,
                metadata: [
                    { label: 'Member Name', value: effectiveName },
                    { label: 'Phone Number', value: effectivePhone || 'N/A' },
                    { label: 'Email Address', value: effectiveEmail || 'N/A' },
                    { label: 'Topic / Notes', value: notes || 'Human Support Handover' },
                    { label: 'Channel', value: 'Isha AI Live Handover' },
                ],
                actionUrl: `${process.env.FRONTEND_URL || 'https://vaziro.in'}/admin`,
                actionText: 'Open Admin Console',
            }).catch((err) => console.warn('[AIController] Callback notification failed:', err?.message));
            return res.status(200).json({
                success: true,
                message: 'All our support executives are currently assisting other members. Your priority callback request has been logged! An executive will call you back shortly.',
                data: {
                    phone: effectivePhone,
                    name: effectiveName,
                    status: 'LOGGED',
                },
            });
        }
        catch (error) {
            console.error('[AIController] requestCallback error:', error.message);
            return res.status(500).json({
                success: false,
                error: { message: 'Failed to log callback request.' },
            });
        }
    }
}
exports.AIController = AIController;
