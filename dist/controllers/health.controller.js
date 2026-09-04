"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const prisma_1 = require("../lib/prisma");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class HealthController {
    static async ping(req, res) {
        const rawUrl = process.env.DATABASE_URL || '';
        const maskedUrl = rawUrl.replace(/:([^:@/]+)@/, ':***@');
        const normalizedUrl = (0, prisma_1.getNormalizedDatabaseUrl)().replace(/:([^:@/]+)@/, ':***@');
        let dbFileExists = null;
        let dbFileSize = null;
        let resolvedDbPath = null;
        if (rawUrl.startsWith('file:') || !rawUrl) {
            const filePath = rawUrl.replace('file:', '').split('?')[0];
            resolvedDbPath = path_1.default.isAbsolute(filePath) ? filePath : path_1.default.resolve(process.cwd(), filePath || 'prisma/dev.db');
            try {
                dbFileExists = fs_1.default.existsSync(resolvedDbPath);
                if (dbFileExists) {
                    dbFileSize = fs_1.default.statSync(resolvedDbPath).size;
                }
            }
            catch (e) { }
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
    static async getHealth(req, res) {
        let timer;
        try {
            // 3-second hard timeout for database ping to prevent infinite hanging
            const queryPromise = prisma_1.prisma.$queryRaw `SELECT 1`;
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
        }
        catch (error) {
            return res.status(503).json({
                success: false,
                message: 'Database connectivity failure',
                error: error?.message || 'Database query timeout or error',
                data: {
                    status: 'DEGRADED',
                    database: 'DISCONNECTED',
                },
            });
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
}
exports.HealthController = HealthController;
