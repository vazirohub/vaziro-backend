import { Request, Response } from 'express';
import { prisma, getNormalizedDatabaseUrl } from '../lib/prisma';
import fs from 'fs';
import path from 'path';

export class HealthController {
  static async ping(req: Request, res: Response) {
    const rawUrl = process.env.DATABASE_URL || '';
    const maskedUrl = rawUrl.replace(/:([^:@/]+)@/, ':***@');
    const normalizedUrl = getNormalizedDatabaseUrl().replace(/:([^:@/]+)@/, ':***@');

    let dbFileExists: boolean | null = null;
    let dbFileSize: number | null = null;
    let resolvedDbPath: string | null = null;

    if (rawUrl.startsWith('file:') || !rawUrl) {
      const filePath = rawUrl.replace('file:', '').split('?')[0];
      resolvedDbPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath || 'prisma/dev.db');
      try {
        dbFileExists = fs.existsSync(resolvedDbPath);
        if (dbFileExists) {
          dbFileSize = fs.statSync(resolvedDbPath).size;
        }
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      message: 'PONG',
      server: 'Vaziro Marketplace API',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'unknown',
      cwd: process.cwd(),
      pid: process.pid,
      database: {
        rawUrl: maskedUrl || 'NOT_SET',
        normalizedUrl,
        isSqlite: maskedUrl.startsWith('file:') || maskedUrl === 'NOT_SET',
        resolvedDbPath,
        dbFileExists,
        dbFileSize,
      },
    });
  }

  static async getHealth(req: Request, res: Response) {
    let timer: NodeJS.Timeout | undefined;
    try {
      // 3-second hard timeout for database ping to prevent infinite hanging
      const queryPromise = prisma.$queryRaw`SELECT 1`;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('DATABASE_QUERY_TIMEOUT: Operation exceeded 3000ms')), 3000);
      });

      await Promise.race([queryPromise, timeoutPromise]);

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
    } catch (error: any) {
      return res.status(503).json({
        success: false,
        message: 'Database connectivity failure',
        error: error?.message || 'Database query timeout or error',
        data: {
          status: 'DEGRADED',
          database: 'DISCONNECTED',
        },
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

}

