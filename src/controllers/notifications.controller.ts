import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export class NotificationsController {
  /**
   * List notifications for authenticated user
   * GET /api/v1/notifications
   */
  static async listNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const userId = req.user.id;
      const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || '20', 10)));
      const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));
      const unreadOnly = req.query.unreadOnly === 'true';

      const whereClause: any = { userId };
      if (unreadOnly) {
        whereClause.isRead = false;
      }

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.notification.count({ where: whereClause }),
        prisma.notification.count({ where: { userId, isRead: false } }),
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
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark a single notification as read
   * PATCH /api/v1/notifications/:id/read
   */
  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { id } = req.params;
      const userId = req.user.id;

      const notification = await prisma.notification.findFirst({
        where: { id, userId },
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Notification not found' },
        });
      }

      await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      const unreadCount = await prisma.notification.count({
        where: { userId, isRead: false },
      });

      return res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: { id, isRead: true, unreadCount },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark all notifications as read for current user
   * PATCH /api/v1/notifications/read-all
   */
  static async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const userId = req.user.id;

      const result = await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });

      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        data: { count: result.count, unreadCount: 0 },
      });
    } catch (error) {
      next(error);
    }
  }
}
