// controllers/activityController.js
import crypto from 'crypto';
import { Session, Activity } from '../models/index.js';
import User from '../models/User.js';
import { ok, fail, notFoundRes, asyncHandler } from '../utils/response.js';

/**
 * Helper to parse basic device info from user-agent
 */
function parseDevice(userAgent = '') {
  const ua = userAgent.toLowerCase();
  let type = 'desktop';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    type = 'mobile';
  } else if (/tablet|ipad/i.test(ua)) {
    type = 'tablet';
  }

  let browser = 'Unknown';
  if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('safari')) browser = 'Safari';

  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  return { type, browser, os };
}

/* ────────────────────────────────────────────────────────
   POST /api/activity/session/start
   Start or resume user session
──────────────────────────────────────────────────────── */
export const startSession = asyncHandler(async (req, res) => {
  const incomingId = (req.body?.sessionId || req.headers['x-session-id'] || '').toString().trim();
  const sessionId = incomingId || crypto.randomUUID();
  const now = new Date();

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  const device = req.body?.device || parseDevice(userAgent);
  const referrer = req.body?.referrer || req.headers.referer || '';
  const currentPage = req.body?.currentPage || req.body?.path || '';

  let session = await Session.findOne({ sessionId });
  if (!session) {
    session = await Session.create({
      user: req.user._id,
      sessionId,
      startedAt: now,
      lastHeartbeat: now,
      isActive: true,
      duration: 0,
      ip,
      userAgent,
      device,
      referrer,
      currentPage,
    });
  } else {
    session.lastHeartbeat = now;
    session.isActive = true;
    if (currentPage) session.currentPage = currentPage;
    if (ip) session.ip = ip;
    if (userAgent) session.userAgent = userAgent;
    await session.save();
  }

  // Update user lastLoginAt & lastActiveAt
  await User.findByIdAndUpdate(req.user._id, {
    lastLoginAt: now,
    lastActiveAt: now,
  }).catch(err => console.error('[Activity] Error updating user login time:', err.message));

  // Log session_start activity
  Activity.create({
    user: req.user._id,
    sessionId,
    type: 'session_start',
    action: 'session_start',
    page: { path: currentPage, title: req.body?.title || '' },
    metadata: { referrer, device },
    ip,
    userAgent,
  }).catch(err => console.error('[Activity] Error logging session start:', err.message));

  return ok(res, { sessionId, session }, 'Session started successfully');
});

/* ────────────────────────────────────────────────────────
   POST /api/activity/heartbeat
   Periodic activity ping to maintain session duration
──────────────────────────────────────────────────────── */
export const heartbeat = asyncHandler(async (req, res) => {
  const sessionId = (req.headers['x-session-id'] || req.body?.sessionId || '').toString().trim();
  const now = new Date();

  // Update user last active timestamp
  await User.findByIdAndUpdate(req.user._id, {
    lastActiveAt: now,
  }).catch(err => console.error('[Activity] Error updating user lastActiveAt:', err.message));

  let duration = 0;
  if (sessionId) {
    const session = await Session.findOne({ sessionId, user: req.user._id });
    if (session) {
      duration = Math.max(0, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000));
      session.lastHeartbeat = now;
      session.duration = duration;
      session.isActive = true;
      if (req.body?.currentPage || req.body?.path) {
        session.currentPage = req.body.currentPage || req.body.path;
      }
      await session.save();
    }
  }

  return ok(res, { active: true, duration, sessionId }, 'Heartbeat recorded');
});

/* ────────────────────────────────────────────────────────
   POST /api/activity/page-view
   Log a page view navigation
──────────────────────────────────────────────────────── */
export const pageView = asyncHandler(async (req, res) => {
  const sessionId = (req.headers['x-session-id'] || req.body?.sessionId || '').toString().trim() || null;
  const { path = '', title = '', durationOnPage = 0, metadata = {} } = req.body || {};
  const now = new Date();

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  const activity = await Activity.create({
    user: req.user._id,
    sessionId,
    type: 'page_view',
    action: 'page_view',
    page: { path, title },
    durationOnPage: Number(durationOnPage) || 0,
    metadata,
    ip,
    userAgent,
  });

  if (sessionId) {
    await Session.findOneAndUpdate(
      { sessionId, user: req.user._id },
      {
        $inc: { pageViewsCount: 1 },
        lastHeartbeat: now,
        currentPage: path,
        isActive: true,
      }
    ).catch(err => console.error('[Activity] Error updating session on page view:', err.message));
  }

  // Attribute durationOnPage to the prior page_view record for that previous path
  if (metadata?.previousPath && Number(durationOnPage) > 0) {
    Activity.findOneAndUpdate(
      { user: req.user._id, sessionId, type: 'page_view', 'page.path': metadata.previousPath },
      { $inc: { durationOnPage: Number(durationOnPage) } },
      { sort: { createdAt: -1 } }
    ).catch(() => {});
  }

  await User.findByIdAndUpdate(req.user._id, {
    lastActiveAt: now,
  }).catch(err => console.error('[Activity] Error updating user lastActiveAt on page view:', err.message));

  return ok(res, { activity }, 'Page view recorded');
});


/* ────────────────────────────────────────────────────────
   POST /api/activity/track
   Log arbitrary user action / interaction
──────────────────────────────────────────────────────── */
export const trackActivity = asyncHandler(async (req, res) => {
  const sessionId = (req.headers['x-session-id'] || req.body?.sessionId || '').toString().trim() || null;
  const { type = 'action', action = 'custom_action', page = {}, metadata = {} } = req.body || {};
  const now = new Date();

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  const activity = await Activity.create({
    user: req.user._id,
    sessionId,
    type,
    action,
    page: {
      path: page.path || '',
      title: page.title || '',
    },
    metadata,
    ip,
    userAgent,
  });

  if (sessionId) {
    await Session.findOneAndUpdate(
      { sessionId, user: req.user._id },
      {
        $inc: { actionsCount: 1 },
        lastHeartbeat: now,
        isActive: true,
      }
    ).catch(err => console.error('[Activity] Error updating session on action track:', err.message));
  }

  await User.findByIdAndUpdate(req.user._id, {
    lastActiveAt: now,
  }).catch(err => console.error('[Activity] Error updating user lastActiveAt on action track:', err.message));

  return ok(res, { activity }, 'Activity tracked');
});

/* ────────────────────────────────────────────────────────
   POST /api/activity/session/end
   Beacon / unload flush when user navigates away or logs out
──────────────────────────────────────────────────────── */
export const endSession = asyncHandler(async (req, res) => {
  const sessionId = (req.headers['x-session-id'] || req.body?.sessionId || '').toString().trim();
  const now = new Date();

  if (sessionId) {
    const session = await Session.findOne({ sessionId, user: req.user._id });
    if (session) {
      const finalDuration = Math.max(0, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000));
      session.isActive = false;
      session.endedAt = now;
      session.lastHeartbeat = now;
      session.duration = finalDuration;
      await session.save();

      Activity.create({
        user: req.user._id,
        sessionId,
        type: 'session_end',
        action: 'session_end',
        metadata: { duration: finalDuration },
        ip: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
      }).catch(() => {});
    }
  }

  return ok(res, { ended: true }, 'Session ended');
});

