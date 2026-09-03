"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const prisma_1 = require("../lib/prisma");
class HealthController {
    static async getHealth(req, res) {
        try {
            await prisma_1.prisma.$queryRaw `SELECT 1`;
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
                data: {
                    status: 'DEGRADED',
                    database: 'DISCONNECTED',
                },
            });
        }
    }
}
exports.HealthController = HealthController;
