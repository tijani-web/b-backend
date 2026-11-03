import { Response } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';

/** GET /api/notifications — fetch current user's notifications (newest first) */
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 30;

    const notifications = await (prisma as any).notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await (prisma as any).notification.count({
      where: { userId, isRead: false },
    });

    res.status(200).json({ notifications, unreadCount });
  } catch (error) {
    logger.error('getNotifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

/** PUT /api/notifications/:id/read — mark single notification as read */
export const markNotificationRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const id = req.params.id as string;

    await (prisma as any).notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });

    res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    logger.error('markNotificationRead error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

/** PUT /api/notifications/read-all — mark all notifications as read */
export const markAllNotificationsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    await (prisma as any).notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    logger.error('markAllNotificationsRead error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};
