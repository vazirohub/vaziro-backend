"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiService = void 0;
const config_1 = require("../config");
class GeminiService {
    static clientInstance = null;
    /**
     * Check if Gemini API key exists and service is enabled
     */
    static isAvailable() {
        const key = process.env.GEMINI_API_KEY || config_1.config.gemini.apiKey;
        return Boolean(key && key.trim().length > 0);
    }
    /**
     * Get or initialize the official GoogleGenAI client singleton
     */
    static async getClient() {
        if (!this.isAvailable()) {
            return null;
        }
        if (!this.clientInstance) {
            try {
                const { GoogleGenAI } = await Promise.resolve().then(() => __importStar(require('@google/genai')));
                const apiKey = process.env.GEMINI_API_KEY || config_1.config.gemini.apiKey;
                this.clientInstance = new GoogleGenAI({ apiKey });
            }
            catch (err) {
                console.error('[GeminiService] Failed to load @google/genai SDK:', err.message);
                return null;
            }
        }
        return this.clientInstance;
    }
    /**
     * Internal Health Check: Verifies API key, client init, and model ping without exposing secrets
     */
    static async healthCheck() {
        const startTime = Date.now();
        const model = process.env.GEMINI_MODEL || config_1.config.gemini.model || 'gemini-flash-latest';
        if (!this.isAvailable()) {
            return {
                status: 'UNHEALTHY',
                model,
                latencyMs: 0,
                message: 'GEMINI_API_KEY environment variable is not configured.',
            };
        }
        try {
            const client = await this.getClient();
            if (!client) {
                return {
                    status: 'UNHEALTHY',
                    model,
                    latencyMs: Date.now() - startTime,
                    message: 'Unable to initialize @google/genai client.',
                };
            }
            // Ping with lightweight token limit
            const response = await client.models.generateContent({
                model,
                contents: 'Ping',
                config: {
                    maxOutputTokens: 10,
                    temperature: 0.1,
                },
            });
            const latencyMs = Date.now() - startTime;
            const hasResponse = Boolean(response?.text && response.text.length > 0);
            return {
                status: hasResponse ? 'HEALTHY' : 'UNHEALTHY',
                model,
                latencyMs,
                message: hasResponse ? 'Gemini AI service is operational.' : 'Empty response from model.',
            };
        }
        catch (error) {
            const latencyMs = Date.now() - startTime;
            console.error('[GeminiService] Health check failed:', error.message);
            return {
                status: 'UNHEALTHY',
                model,
                latencyMs,
                message: 'Gemini health ping failed. Verify API key permissions or network access.',
            };
        }
    }
    /**
     * Reusable text generation with token limits, temperature, and timeout protection
     */
    static async generateText(prompt, options = {}) {
        if (!this.isAvailable()) {
            return null;
        }
        const client = await this.getClient();
        if (!client)
            return null;
        const primaryModel = process.env.GEMINI_MODEL || config_1.config.gemini.model || 'gemini-flash-latest';
        const candidateModels = [primaryModel, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
        const modelsToTry = candidateModels.filter((m, idx, arr) => arr.indexOf(m) === idx);
        const startTime = Date.now();
        for (const model of modelsToTry) {
            try {
                const response = await client.models.generateContent({
                    model,
                    contents: prompt,
                    config: {
                        systemInstruction: options.systemInstruction,
                        maxOutputTokens: options.maxOutputTokens || 800,
                        temperature: options.temperature ?? 0.3,
                    },
                });
                const text = response?.text?.trim() || null;
                if (text) {
                    console.log(`[GeminiService] generateText (${model}) completed in ${Date.now() - startTime}ms`);
                    return text;
                }
            }
            catch (error) {
                console.warn(`[GeminiService] generateText error (${model}):`, error.message);
                // Continue to fallback model if available
            }
        }
        return null;
    }
    /**
     * Reusable structured JSON generation with native responseMimeType and robust fallback parser
     */
    static async generateStructuredJSON(prompt, options = {}) {
        if (!this.isAvailable()) {
            return null;
        }
        const client = await this.getClient();
        if (!client)
            return null;
        const primaryModel = process.env.GEMINI_MODEL || config_1.config.gemini.model || 'gemini-flash-latest';
        const candidateModels = [primaryModel, 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
        const modelsToTry = candidateModels.filter((m, idx, arr) => arr.indexOf(m) === idx);
        const startTime = Date.now();
        for (const model of modelsToTry) {
            try {
                const response = await client.models.generateContent({
                    model,
                    contents: `${prompt}\n\nIMPORTANT: Respond with pure JSON ONLY. Do not wrap in markdown or prose.`,
                    config: {
                        systemInstruction: options.systemInstruction,
                        maxOutputTokens: options.maxOutputTokens || 800,
                        temperature: options.temperature ?? 0.2,
                        responseMimeType: 'application/json',
                    },
                });
                const rawText = response?.text?.trim();
                if (!rawText)
                    continue;
                // Clean markdown fences if present
                const cleaned = rawText
                    .replace(/^```json\s*/i, '')
                    .replace(/^```\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();
                let parsed = null;
                try {
                    parsed = JSON.parse(cleaned);
                }
                catch {
                    // Extract innermost JSON object or array
                    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
                    if (jsonMatch) {
                        try {
                            parsed = JSON.parse(jsonMatch[0]);
                        }
                        catch { }
                    }
                }
                if (parsed) {
                    console.log(`[GeminiService] generateStructuredJSON (${model}) completed in ${Date.now() - startTime}ms`);
                    return parsed;
                }
            }
            catch (error) {
                console.warn(`[GeminiService] generateStructuredJSON error (${model}):`, error.message);
                // Continue to fallback model if available
            }
        }
        return null;
    }
    /**
     * Section 10 & 12: Natural Language Requirement Extraction
     * Extracts structured JSON from free-form customer requests
     */
    static async extractRequirementFromNaturalLanguage(userText) {
        const prompt = `
Extract structured service requirement details from this customer inquiry:
"${userText}"

Map to realistic Indian services (e.g. Elderly Caregiver, Fitness Trainer, Home Cook / Chef, Home Nurse, Home Tutor, Baby Caregiver / Japa, Physiotherapist, Yoga Trainer, Appliance Repair, House Cleaning).

Required JSON structure:
{
  "category": "Service category name",
  "service": "Specific service requested",
  "location": "Locality or city name",
  "city": "Detected Indian City or null",
  "pincode": "6-digit postal code if mentioned, or null",
  "date": "Desired date/day if specified or 'Flexible'",
  "preferredTime": "Morning/Evening/Full-time or null",
  "urgency": "LOW" | "NORMAL" | "HIGH" | "EMERGENCY",
  "budgetMin": <number in INR or null>,
  "budgetMax": <number in INR or null>,
  "requirements": ["key requirement 1", "key requirement 2"]
}
`;
        return this.generateStructuredJSON(prompt, {
            systemInstruction: 'You extract clean, structured requirement parameters from natural language for an Indian marketplace.',
            maxOutputTokens: 600,
        });
    }
    /**
     * Section 10: Smart Requirement Assistant ("Polish with AI")
     */
    static async polishRequirement(data) {
        const prompt = `
Refine these customer requirement notes into a professional, structured job post for Vaziro:
Category: ${data.categoryName || 'General Service'}
City: ${data.city || 'India'}
Customer Notes: "${data.rawDescription}"

Required JSON structure:
{
  "title": "Clear concise headline under 75 chars",
  "description": "Comprehensive structured scope with bullet points of daily tasks, timings, and expectations",
  "suggestedBudgetMin": <realistic INR minimum budget>,
  "suggestedBudgetMax": <realistic INR maximum budget>,
  "timelineDays": <estimated duration in days, e.g. 1 for single-day service, 30 for monthly>
}
`;
        return this.generateStructuredJSON(prompt, {
            systemInstruction: 'You are an expert marketplace job specification assistant in India.',
            maxOutputTokens: 700,
        });
    }
    /**
     * Section 11: Candidate Match Rationale Engine
     */
    static async evaluateCandidateMatch(requirement, professional, quotation) {
        const prompt = `
Evaluate the candidate professional match for this requirement:
REQUIREMENT:
- Title: ${requirement.title || 'Service Request'}
- Category: ${requirement.category?.name || requirement.categoryName || 'General'}
- Subcategory: ${requirement.subcategory?.name || 'Standard'}
- City: ${requirement.city?.name || requirement.cityName || 'City'}
- Budget: ₹${requirement.minimumBudget || 0} - ₹${requirement.maximumBudget || 0}
- Details: ${requirement.description || 'N/A'}

CANDIDATE:
- Name: ${professional.firstName || ''} ${professional.lastName || ''}
- Verified: ${professional.isVerified ? 'DigiLocker Verified' : 'Standard'}
- Rating: ${professional.rating ? `${professional.rating}★` : 'New'}
- Completed Jobs: ${professional.completedJobsCount || 0}
- Location: ${professional.city?.name || 'Local'}
${quotation ? `- Quote: ₹${quotation.amount || 'N/A'}\n- Timeline: ${quotation.estimatedTimeline || 'N/A'}` : ''}

Required JSON structure:
{
  "score": <number 65-99>,
  "ratingGrade": "EXCELLENT" | "HIGH" | "MODERATE" | "BASIC",
  "reasons": [
    "Compelling match reason 1",
    "Compelling match reason 2",
    "Compelling match reason 3"
  ]
}
`;
        return this.generateStructuredJSON(prompt, {
            systemInstruction: 'You evaluate marketplace provider suitability objectively and encouragingly.',
            maxOutputTokens: 500,
        });
    }
    /**
     * Section 8 & 9: Grounded Support Query Answerer
     */
    static async answerSupportQuery(userMessage, history = [], accountContext, userRole = 'CUSTOMER') {
        const systemInstruction = `
You are the official Vaziro AI Support Assistant for Vaziro (Proanta Technologies Private Limited), India's premier services marketplace.

VAZIRO CORE POLICIES & TRUTHS:
1. 0% Commission: Vaziro charges 0% commission on professional job earnings. Professionals only spend low-cost credits to unlock customer requirements and send quotes.
2. 100% Escrow Milestone Protection: Customer funds are held securely in escrow upon hiring and released only after the customer confirms satisfactory completion.
3. Candidate Credit Refunds: Unhired professionals or candidates on cancelled requirements automatically receive a 100% credit refund to their wallet.
4. Verified Pros: Professionals undergo DigiLocker / Aadhaar / PAN verification and police background checks.
5. Customer Requirements: Customers post requirements for free and receive competitive quotes within minutes.
6. Masked Calling & Secure Chat: Contact details remain masked before hiring to preserve privacy.
7. Platform Fee: A nominal 6% platform fee applies to completed customer payments.

${accountContext ? `ACCOUNT-SPECIFIC CONTEXT (Verified from Vaziro database for this authenticated user):\n${accountContext}\nUse this verified context to answer questions about their wallet, jobs, refunds, or status accurately.` : 'The user is not signed in. For questions about their specific wallet, jobs, or refunds, politely advise them to sign in.'}

RULES:
- Answer politely, accurately, and concisely (2-3 short paragraphs or bullet points).
- NEVER alter any financial records or promise unauthorized actions.
- Target response for ${userRole === 'PROFESSIONAL' ? 'a Service Professional partner' : 'a Customer'}.
- Tone: Professional, trustworthy, Indian marketplace context (INR ₹).
`;
        let conversationText = '';
        if (history.length > 0) {
            conversationText = history
                .slice(-4)
                .map((m) => `${m.role === 'user' ? 'User' : 'Vaziro AI'}: ${m.text}`)
                .join('\n') + '\n\n';
        }
        const fullPrompt = `${conversationText}User Query: ${userMessage}`;
        const result = await this.generateText(fullPrompt, {
            systemInstruction,
            maxOutputTokens: 600,
            temperature: 0.3,
        });
        return (result ||
            'I apologize, but our AI assistant is experiencing high network latency. For urgent support, please reach out directly to support@vaziro.in.');
    }
}
exports.GeminiService = GeminiService;
