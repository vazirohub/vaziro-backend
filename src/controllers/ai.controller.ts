import { Request, Response } from 'express';
import { GeminiService } from '../services/gemini.service';
import { AIMatchService } from '../services/ai-match.service';
import { AISupportService } from '../services/ai-support.service';

export class AIController {
  /**
   * POST /api/v1/ai/chat
   * Official AI Support Chat: Handles both general marketplace questions and secure account-specific queries
   */
  static async chat(req: Request, res: Response) {
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
      const user = (req as any).user;
      const userId = user?.id;
      const userRole = user?.roles?.[0] || 'CUSTOMER';

      const result = await AISupportService.handleChatQuery({
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
        userId,
        userRole,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
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
  static async extractRequirement(req: Request, res: Response) {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Text input is required to extract requirement parameters.' },
        });
      }

      const extracted = await GeminiService.extractRequirementFromNaturalLanguage(text.trim());

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
    } catch (error: any) {
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
  static async polishRequirement(req: Request, res: Response) {
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

      const result = await GeminiService.polishRequirement({
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
    } catch (error: any) {
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
  static async getMatchRationale(req: Request, res: Response) {
    try {
      const { requirement, professional, quotation } = req.body;

      if (!requirement || !professional) {
        return res.status(400).json({
          success: false,
          error: { message: 'Requirement and professional data are required.' },
        });
      }

      const match = await AIMatchService.calculateMatchScoreWithGemini(requirement, professional, quotation);

      return res.status(200).json({
        success: true,
        data: match,
      });
    } catch (error: any) {
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
  static async healthCheck(_req: Request, res: Response) {
    try {
      const health = await GeminiService.healthCheck();
      const statusCode = health.status === 'HEALTHY' ? 200 : 503;

      return res.status(statusCode).json({
        success: health.status === 'HEALTHY',
        data: health,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: 'AI health check encountered an error.' },
      });
    }
  }
}
