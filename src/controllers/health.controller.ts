import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export class HealthController {
  static async getHealth(req: Request, res: Response) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.status(200).json({
        success: true,
        message: 'Vaziro Marketplace API is operational.',
        data: {
          status: 'UP',
          database: 'CONNECTED',
          product: 'Vaziro',
          company: 'Proanta Technologies Private Limited',
          market: 'India',
          currency: 'INR (₹)',
          timezone: 'Asia/Kolkata',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return res.status(503).json({
        success: false,
        message: 'Database connectivity failure',
        data: {
          status: 'DEGRADED',
          database: 'DISCONNECTED',
        },
      });
    }
  }
}
