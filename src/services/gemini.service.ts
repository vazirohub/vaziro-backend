import { config } from '../config';

export interface StructuredRequirementOutput {
  category: string;
  subcategoryId?: string | null;
  service: string;
  location: string;
  city?: string | null;
  pincode?: string | null;
  date?: string | null;
  preferredTime?: string | null;
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  budgetMin?: number | null;
  budgetMax?: number | null;
  requirements: string[];
}

export interface PolishedRequirementOutput {
  title: string;
  description: string;
  suggestedBudgetMin: number;
  suggestedBudgetMax: number;
  timelineDays: number;
}

export interface CandidateMatchOutput {
  score: number;
  ratingGrade: 'EXCELLENT' | 'HIGH' | 'MODERATE' | 'BASIC';
  reasons: string[];
}

export class GeminiService {
  private static clientInstance: any = null;

  /**
   * Check if Gemini API key exists and service is enabled
   */
  static isAvailable(): boolean {
    const key = process.env.GEMINI_API_KEY || config.gemini.apiKey;
    return Boolean(key && key.trim().length > 0);
  }

  /**
   * Get or initialize the official GoogleGenAI client singleton
   */
  private static async getClient(): Promise<any> {
    if (!this.isAvailable()) {
      return null;
    }

    if (!this.clientInstance) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const apiKey = process.env.GEMINI_API_KEY || config.gemini.apiKey;
        this.clientInstance = new GoogleGenAI({ apiKey });
      } catch (err: any) {
        console.error('[GeminiService] Failed to load @google/genai SDK:', err.message);
        return null;
      }
    }

    return this.clientInstance;
  }

  /**
   * Internal Health Check: Verifies API key, client init, and model ping without exposing secrets
   */
  static async healthCheck(): Promise<{
    status: 'HEALTHY' | 'UNHEALTHY';
    model: string;
    latencyMs: number;
    message: string;
  }> {
    const startTime = Date.now();
    const model = process.env.GEMINI_MODEL || config.gemini.model || 'gemini-flash-latest';

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
    } catch (error: any) {
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
  static async generateText(
    prompt: string,
    options: {
      systemInstruction?: string;
      maxOutputTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const client = await this.getClient();
    if (!client) return null;

    const primaryModel = process.env.GEMINI_MODEL || config.gemini.model || 'gemini-flash-latest';
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
      } catch (error: any) {
        console.warn(`[GeminiService] generateText error (${model}):`, error.message);
        // Continue to fallback model if available
      }
    }

    return null;
  }

  /**
   * Reusable structured JSON generation with native responseMimeType and robust fallback parser
   */
  static async generateStructuredJSON<T>(
    prompt: string,
    options: {
      systemInstruction?: string;
      maxOutputTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<T | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const client = await this.getClient();
    if (!client) return null;

    const primaryModel = process.env.GEMINI_MODEL || config.gemini.model || 'gemini-flash-latest';
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
        if (!rawText) continue;

        // Clean markdown fences if present
        const cleaned = rawText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        let parsed: T | null = null;
        try {
          parsed = JSON.parse(cleaned) as T;
        } catch {
          // Extract innermost JSON object or array
          const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]) as T;
            } catch {}
          }
        }

        if (parsed) {
          console.log(`[GeminiService] generateStructuredJSON (${model}) completed in ${Date.now() - startTime}ms`);
          return parsed;
        }
      } catch (error: any) {
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
  static async extractRequirementFromNaturalLanguage(
    userText: string
  ): Promise<StructuredRequirementOutput | null> {
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

    return this.generateStructuredJSON<StructuredRequirementOutput>(prompt, {
      systemInstruction: 'You extract clean, structured requirement parameters from natural language for an Indian marketplace.',
      maxOutputTokens: 600,
    });
  }

  /**
   * Section 10: Smart Requirement Assistant ("Polish with AI")
   */
  static async polishRequirement(data: {
    categoryName?: string;
    rawDescription: string;
    city?: string;
  }): Promise<PolishedRequirementOutput | null> {
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

    return this.generateStructuredJSON<PolishedRequirementOutput>(prompt, {
      systemInstruction: 'You are an expert marketplace job specification assistant in India.',
      maxOutputTokens: 700,
    });
  }

  /**
   * Section 11: Candidate Match Rationale Engine
   */
  static async evaluateCandidateMatch(
    requirement: any,
    professional: any,
    quotation?: any
  ): Promise<CandidateMatchOutput | null> {
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

    return this.generateStructuredJSON<CandidateMatchOutput>(prompt, {
      systemInstruction: 'You evaluate marketplace provider suitability objectively and encouragingly.',
      maxOutputTokens: 500,
    });
  }

  /**
   * Section 8 & 9: Grounded Support Query Answerer
   */
  static async answerSupportQuery(
    userMessage: string,
    history: Array<{ role: 'user' | 'model'; text: string }> = [],
    accountContext?: string,
    userRole = 'CUSTOMER'
  ): Promise<string> {
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

    return (
      result ||
      'I apologize, but our AI assistant is experiencing high network latency. For urgent support, please reach out directly to support@vaziro.in.'
    );
  }
}
