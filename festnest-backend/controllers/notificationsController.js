// controllers/notificationsController.js
import { Notification } from '../models/index.js';
import { ok, asyncHandler } from '../utils/response.js';

export const listNotifications = asyncHandler(async (req, res) => {
  const { type, page = 1, limit = 30 } = req.query;
  const filter = { user: req.user._id };
  if (type && type !== 'all') filter.type = type;
  const skip = (Number(page) - 1) * Number(limit);
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);
  return ok(res, { notifications, unreadCount, pagination: { total, page: Number(page), limit: Number(limit) } });
});

export const markRead = asyncHandler(async (req, res) => {
  await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { isRead: true });
  return ok(res, {}, 'Marked as read');
});

export const markAllRead = asyncHandler(async (req, res) => {
  const { modifiedCount } = await Notification.updateMany({ user: req.user._id }, { isRead: true });
  return ok(res, { updated: modifiedCount }, 'All notifications marked as read');
});

export const deleteNotification = asyncHandler(async (req, res) => {
  await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  return ok(res, {}, 'Notification deleted');
});

export const clearAllNotifications = asyncHandler(async (req, res) => {
  const { deletedCount } = await Notification.deleteMany({ user: req.user._id });
  return ok(res, { deleted: deletedCount }, 'All notifications cleared');
});
