import { Router } from 'express';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/', authenticate, getNotifications);
router.put('/read-all', authenticate, markAllNotificationsRead);
router.put('/:id/read', authenticate, markNotificationRead);

export default router;
