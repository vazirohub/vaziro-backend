"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AISupportService = void 0;
const gemini_service_1 = require("./gemini.service");
const ai_account_tools_service_1 = require("./ai-account-tools.service");
class AISupportService {
    /**
     * Process customer or professional chat message.
     * Seamlessly routes between general knowledge questions and secure account-specific status queries.
     */
    static async handleChatQuery(params) {
        const { message, history = [], userId, userRole = 'CUSTOMER' } = params;
        const isAccountSpecific = ai_account_tools_service_1.AIAccountToolsService.isAccountSpecificQuery(message);
        // 1. If user asks an account-specific question but is NOT authenticated
        if (isAccountSpecific && !userId) {
            return {
                reply: 'To check your personal wallet balance, credit refunds, or active job status, please sign in to your Vaziro account. For general questions about how credits, escrow, and hiring work, I am happy to help right now!',
                isAccountSpecific: true,
            };
        }
        // 2. If authenticated and asking about their account, fetch controlled read-only context
        let accountContext;
        if (isAccountSpecific && userId) {
            accountContext = await ai_account_tools_service_1.AIAccountToolsService.getAccountContextForAI(userId);
        }
        // 3. Generate response using Gemini AI
        if (gemini_service_1.GeminiService.isAvailable()) {
            try {
                const reply = await gemini_service_1.GeminiService.answerSupportQuery(message, history, accountContext, userRole);
                return {
                    reply,
                    isAccountSpecific,
                };
            }
            catch (err) {
                console.warn('[AISupportService] Gemini support call failed, using fallback:', err.message);
            }
        }
        // 4. Safe rule-based fallback if AI is offline
        let fallbackReply = 'Vaziro is an India-focused marketplace connecting customers with verified home and personal service professionals with 0% commission and 100% payment protection.';
        const lower = message.toLowerCase();
        if (lower.includes('escrow') || lower.includes('payment')) {
            fallbackReply =
                'On Vaziro, customer payments are held in 100% secure escrow upon hiring. Funds are released to the professional only after you inspect and approve the completed service.';
        }
        else if (lower.includes('credit') || lower.includes('wallet')) {
            fallbackReply =
                'Vaziro professionals use credits to unlock customer requirements and send quotes. We charge 0% commission on earnings! Unhired candidates automatically get 100% of their application credits refunded.';
        }
        else if (lower.includes('refund')) {
            fallbackReply =
                'If a requirement is cancelled or another professional is hired, your application credits are refunded to your wallet immediately and automatically.';
        }
        else if (lower.includes('verif')) {
            fallbackReply =
                'Professionals on Vaziro are verified via government ID (DigiLocker, Aadhaar, PAN) and background checks to ensure trust and safety.';
        }
        return {
            reply: fallbackReply,
            isAccountSpecific,
            handledOffline: true,
        };
    }
}
exports.AISupportService = AISupportService;
