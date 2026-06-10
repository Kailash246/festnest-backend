// routes/notifications.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listNotifications, markRead, markAllRead,
  deleteNotification, clearAllNotifications,
} from '../controllers/notificationsController.js';

const router = Router();

router.get('/',           requireAuth, listNotifications);
router.patch('/read-all', requireAuth, markAllRead);
router.delete('/',        requireAuth, clearAllNotifications);
router.patch('/:id/read', requireAuth, markRead);
router.delete('/:id',     requireAuth, deleteNotification);

export default router;
