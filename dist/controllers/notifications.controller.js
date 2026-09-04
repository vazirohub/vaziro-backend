"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsController = void 0;
const prisma_1 = require("../lib/prisma");
const notification_service_1 = require("../services/notification.service");
const config_1 = require("../config");
class NotificationsController {
    /**
     * List notifications for authenticated user
     * GET /api/v1/notifications
     */
    static async listNotifications(req, res, next) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
                });
            }
            const userId = req.user.id;
            const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
            const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
            const unreadOnly = req.query.unreadOnly === 'true';
            const whereClause = { userId };
            if (unreadOnly) {
                whereClause.isRead = false;
            }
            const [notifications, total, unreadCount] = await Promise.all([
                prisma_1.prisma.notification.findMany({
                    where: whereClause,
                    orderBy: { createdAt: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma_1.prisma.notification.count({ where: whereClause }),
                prisma_1.prisma.notification.count({ where: { userId, isRead: false } }),
            ]);
            return res.status(200).json({
                success: true,
                data: {
                    notifications,
                    total,
                    unreadCount,
                    hasMore: offset + notifications.length < total,
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Mark a single notification as read
     * PATCH /api/v1/notifications/:id/read
     */
    static async markAsRead(req, res, next) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
                });
            }
            const { id } = req.params;
            const userId = req.user.id;
            const notification = await prisma_1.prisma.notification.findFirst({
                where: { id, userId },
            });
            if (!notification) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Notification not found' },
                });
            }
            await prisma_1.prisma.notification.update({
                where: { id },
                data: { isRead: true },
            });
            const unreadCount = await prisma_1.prisma.notification.count({
                where: { userId, isRead: false },
            });
            return res.status(200).json({
                success: true,
                message: 'Notification marked as read',
                data: { id, isRead: true, unreadCount },
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Mark all notifications as read for current user
     * PATCH /api/v1/notifications/read-all
     */
    static async markAllAsRead(req, res, next) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
                });
            }
            const userId = req.user.id;
            const result = await prisma_1.prisma.notification.updateMany({
                where: { userId, isRead: false },
                data: { isRead: true },
            });
            return res.status(200).json({
                success: true,
                message: 'All notifications marked as read',
                data: { count: result.count, unreadCount: 0 },
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Diagnostic test email endpoint
     * POST /api/v1/notifications/test-email
     */
    static async sendTestEmail(req, res, next) {
        try {
            const recipient = req.body?.to?.trim() || req.user?.email || 'proanta2026@gmail.com';
            const result = await notification_service_1.NotificationService.sendEmailViaResend({
                to: recipient,
                subject: 'Vaziro Transactional Email System Verification',
                html: notification_service_1.NotificationService.generateEmailTemplate({
                    title: 'Vaziro Email System Operational',
                    message: 'This test message confirms that the Vaziro transactional email engine via Resend is working properly with full HTML formatting and delivery reporting.',
                    userName: req.user?.firstName || 'Valued Partner',
                    actionUrl: `${config_1.config.frontendUrl}/dashboard`,
                    actionText: 'Go to Dashboard',
                }),
            });
            return res.status(result.success ? 200 : 500).json({
                success: result.success,
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.NotificationsController = NotificationsController;
