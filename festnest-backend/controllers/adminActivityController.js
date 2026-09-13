// controllers/adminActivityController.js
import mongoose from 'mongoose';
import User from '../models/User.js';
import { Session, Activity } from '../models/index.js';
import { ok, fail, notFoundRes, asyncHandler } from '../utils/response.js';

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function formatDuration(seconds = 0) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const remSecs = s % 60;
  if (mins < 60) return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

/* ────────────────────────────────────────────────────────
   GET /api/admin/activity/users
   List users with activity status & active-time-today
──────────────────────────────────────────────────────── */
export const listUserActivities = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = (req.query.search || '').trim();
  const status = (req.query.status || 'all').trim().toLowerCase(); // 'all' | 'online' | 'offline'
  const role = (req.query.role || 'all').trim().toLowerCase();
  const sortBy = req.query.sortBy || 'lastActiveAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  const now = Date.now();
  const cutoff = new Date(now - ONLINE_THRESHOLD_MS);

  const query = {};

  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: rx }, { email: rx }, { college: rx }];
  }

  if (role !== 'all') {
    query.role = role;
  }

  if (status === 'online') {
    query.lastActiveAt = { $gte: cutoff };
  } else if (status === 'offline') {
    query.$or = query.$or
      ? [{ $and: [query.$or[0], { $or: [{ lastActiveAt: { $lt: cutoff } }, { lastActiveAt: null }] }] }]
      : [{ lastActiveAt: { $lt: cutoff } }, { lastActiveAt: null }];
  }

  const [users, total, onlineCount] = await Promise.all([
    User.find(query)
      .select('name email role college avatar lastLoginAt lastActiveAt createdAt')
      .sort({ [sortBy]: sortOrder, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
    User.countDocuments({ lastActiveAt: { $gte: cutoff } }),
  ]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const userIds = users.map(u => u._id);

  // Aggregate today's active session time and sessions count for these users
  const todaySessions = await Session.aggregate([
    {
      $match: {
        user: { $in: userIds },
        lastHeartbeat: { $gte: startOfToday },
      },
    },
    {
      $group: {
        _id: '$user',
        activeSeconds: { $sum: '$duration' },
        sessionsToday: { $sum: 1 },
      },
    },
  ]);

  const todayStatsMap = new Map();
  for (const s of todaySessions) {
    todayStatsMap.set(String(s._id), {
      activeSeconds: s.activeSeconds || 0,
      sessionsToday: s.sessionsToday || 0,
    });
  }

  // Get current active or latest session per user for currentPage
  const latestSessions = await Session.aggregate([
    { $match: { user: { $in: userIds } } },
    { $sort: { lastHeartbeat: -1 } },
    {
      $group: {
        _id: '$user',
        currentPage: { $first: '$currentPage' },
        sessionId: { $first: '$sessionId' },
        isActive: { $first: '$isActive' },
        lastHeartbeat: { $first: '$lastHeartbeat' },
      },
    },
  ]);

  const latestSessionMap = new Map();
  for (const s of latestSessions) {
    latestSessionMap.set(String(s._id), s);
  }

  const userItems = users.map(u => {
    const isOnline = Boolean(u.lastActiveAt && new Date(u.lastActiveAt) >= cutoff);
    const todayStat = todayStatsMap.get(String(u._id)) || { activeSeconds: 0, sessionsToday: 0 };
    const latestSession = latestSessionMap.get(String(u._id));

    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      college: u.college,
      avatar: u.avatar,
      lastLoginAt: u.lastLoginAt,
      lastActiveAt: u.lastActiveAt,
      createdAt: u.createdAt,
      isOnline,
      activeTimeToday: todayStat.activeSeconds,
      activeTimeTodayFormatted: formatDuration(todayStat.activeSeconds),
      sessionsToday: todayStat.sessionsToday,
      currentPage: latestSession?.currentPage || '',
      currentSessionId: latestSession?.sessionId || null,
    };
  });

  return ok(res, {
    users: userItems,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    stats: {
      totalUsers: total,
      onlineCount,
      offlineCount: Math.max(0, total - onlineCount),
    },
  }, 'User activities fetched successfully');
});

/* ────────────────────────────────────────────────────────
   GET /api/admin/activity/users/:userId
   Detailed activity timeline, sessions & page visits
──────────────────────────────────────────────────────── */
export const getUserActivityDetail = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return fail(res, 'Invalid user ID', 400);
  }

  const user = await User.findById(userId).select('-password').lean();
  if (!user) return notFoundRes(res, 'User not found');

  const now = Date.now();
  const cutoff = new Date(now - ONLINE_THRESHOLD_MS);
  const isOnline = Boolean(user.lastActiveAt && new Date(user.lastActiveAt) >= cutoff);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    sessions,
    pagesVisited,
    timeline,
    totalSessions,
    totalActivities,
    todaySessionAgg,
    allTimeSessionAgg,
  ] = await Promise.all([
    // Last 30 sessions
    Session.find({ user: user._id })
      .sort({ startedAt: -1 })
      .limit(30)
      .lean(),

    // Pages visited aggregation
    Activity.aggregate([
      {
        $match: {
          user: user._id,
          'page.path': { $exists: true, $ne: '' },
        },
      },
      {
        $group: {
          _id: '$page.path',
          path: { $first: '$page.path' },
          title: { $first: '$page.title' },
          visitCount: { $sum: 1 },
          totalDuration: { $sum: '$durationOnPage' },
          lastVisitedAt: { $max: '$createdAt' },
        },
      },
      { $match: { path: { $ne: '' } } },
      { $sort: { visitCount: -1 } },
      { $limit: 30 },
    ]),

    // Activity timeline (last 100)
    Activity.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),

    Session.countDocuments({ user: user._id }),
    Activity.countDocuments({ user: user._id }),

    // Active time today
    Session.aggregate([
      {
        $match: {
          user: user._id,
          lastHeartbeat: { $gte: startOfToday },
        },
      },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: '$duration' },
          sessionsToday: { $sum: 1 },
        },
      },
    ]),

    // Total active time all-time
    Session.aggregate([
      {
        $match: { user: user._id },
      },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: '$duration' },
        },
      },
    ]),
  ]);

  const activeTimeToday = todaySessionAgg[0]?.totalDuration || 0;
  const sessionsToday = todaySessionAgg[0]?.sessionsToday || 0;
  const totalActiveTime = allTimeSessionAgg[0]?.totalDuration || 0;

  // Latest session
  const currentSession = sessions[0] || null;

  return ok(res, {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      college: user.college,
      city: user.city,
      avatar: user.avatar,
      points: user.points,
      fnCoins: user.fnCoins,
      lastLoginAt: user.lastLoginAt,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
    },
    isOnline,
    stats: {
      totalSessions,
      sessionsToday,
      totalActivities,
      activeTimeToday,
      activeTimeTodayFormatted: formatDuration(activeTimeToday),
      totalActiveTime,
      totalActiveTimeFormatted: formatDuration(totalActiveTime),
    },
    currentSession,
    sessions,
    pagesVisited: pagesVisited.map(p => ({
      ...p,
      formattedDuration: formatDuration(p.totalDuration),
    })),
    timeline,
  }, 'User activity details fetched successfully');
});
