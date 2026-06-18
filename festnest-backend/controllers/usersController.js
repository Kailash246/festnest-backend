// controllers/usersController.js
import sanitizeHtml from 'sanitize-html';
import User     from '../models/User.js';
import { SavedEvent, Registration, PointsLog, HostedEvent } from '../models/index.js';
import { cloudinary, uploadUserAvatar } from '../config/cloudinary.js';
import { ok, fail, notFoundRes, asyncHandler } from '../utils/response.js';

const STRIP_ALL = { allowedTags: [], allowedAttributes: {} };
const clean = str => (str ? sanitizeHtml(String(str), STRIP_ALL) : str);

export const getMe = asyncHandler(async (req, res) => {
  const [savedCount, regCount] = await Promise.all([
    SavedEvent.countDocuments({ user: req.user._id }),
    Registration.countDocuments({ user: req.user._id }),
  ]);
  return ok(res, { user: req.user.toPublic(), stats: { saved: savedCount, registered: regCount } });
});

export const updateMe = asyncHandler(async (req, res) => {
  const {
    name, college, city, year, branch, phone, interests, notificationPrefs,
    bio, organization, designation, website, linkedin, instagram, github,
  } = req.body;
  const updates = {};
  if (name              !== undefined) updates.name         = clean(name);
  if (college           !== undefined) updates.college      = clean(college);
  if (city              !== undefined) updates.city         = clean(city);
  if (year              !== undefined) updates.year         = year;
  if (branch            !== undefined) updates.branch       = clean(branch);
  if (phone             !== undefined) updates.phone        = phone;
  if (bio               !== undefined) updates.bio          = clean(bio);
  if (organization      !== undefined) updates.organization = clean(organization);
  if (designation       !== undefined) updates.designation  = clean(designation);
  if (website           !== undefined) updates.website      = website;
  if (linkedin          !== undefined) updates.linkedin     = linkedin;
  if (instagram         !== undefined) updates.instagram    = instagram;
  if (github            !== undefined) updates.github       = github;
  if (interests)                       updates.interests    = interests;
  if (notificationPrefs)               updates.notificationPrefs = notificationPrefs;

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  return ok(res, { user: user.toPublic() }, 'Profile updated');
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, 'No image uploaded');

  // Delete old Cloudinary image if exists
  if (req.user.avatar?.publicId) {
    await cloudinary.uploader.destroy(req.user.avatar.publicId).catch(() => {});
  }

  const result = await uploadUserAvatar(req.file.buffer);

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { 'avatar.url': result.secure_url, 'avatar.publicId': result.public_id },
    { new: true }
  );
  return ok(res, { avatar: user.avatar }, 'Avatar updated');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return fail(res, 'currentPassword and newPassword required');
  if (newPassword.length < 8) return fail(res, 'Password must be at least 8 characters');

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword)))
    return fail(res, 'Current password is incorrect', 400);

  user.password = newPassword;
  await user.save();
  return ok(res, {}, 'Password changed successfully');
});

export const myRegistrations = asyncHandler(async (req, res) => {
  const regs = await Registration.find({ user: req.user._id })
    .populate('event').sort({ createdAt: -1 }).lean();
  return ok(res, { registrations: regs });
});

export const myPoints = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('points');
  const log  = await PointsLog.find({ user: req.user._id })
    .populate('event', 'name slug').sort({ createdAt: -1 }).limit(20).lean();
  return ok(res, { totalPoints: user.points, log });
});

export const myHostedEvents = asyncHandler(async (req, res) => {
  const hosted = await HostedEvent.find({ submittedBy: req.user._id }).sort({ createdAt: -1 }).lean();
  return ok(res, { hostedEvents: hosted });
});

// ─────────────────────────────────────────────────────────────────────────

// controllers/notificationsController.js
import { Notification } from '../models/index.js';

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

// ─────────────────────────────────────────────────────────────────────────

// controllers/leaderboardController.js
const POINTS_RULES = [
  { action: 'Register for an event', icon: '🗓️', points: '+50 pts'  },
  { action: 'Attend & check in',     icon: '✅', points: '+150 pts' },
  { action: 'Win a competition',     icon: '🏆', points: '+500 pts' },
  { action: 'Refer a friend',        icon: '📣', points: '+75 pts'  },
  { action: 'Host an event',         icon: '✍️', points: '+300 pts' },
];

function badges(rank, pts) {
  const b = [];
  if (rank === 1) b.push('👑');
  if (pts >= 2000) b.push('🏆');
  if (pts >= 1000) b.push('🔥');
  if (rank <= 3) b.push('🏅');
  if (pts >= 500) b.push('⭐');
  return b;
}

export const getLeaderboard = asyncHandler(async (req, res) => {
  const { period = 'all' } = req.query;

  // For period filters we can filter points_log, but simplest is just sort by user.points
  // (which is maintained as a running total). For finer period breakdowns we aggregate PointsLog.
  let leaderboard;

  if (period === 'all') {
    const users = await User.find({}).select('name college avatar points').sort({ points: -1 }).limit(50).lean();
    leaderboard = users.map((u, i) => ({
      rank: i + 1, id: u._id, name: u.name, college: u.college,
      initials: u.avatar?.initials || u.name.slice(0, 2).toUpperCase(),
      avatarUrl: u.avatar?.url || '',
      pts: u.points,
      badges: badges(i + 1, u.points),
    }));
  } else {
    const dateFilter = period === 'month'
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const agg = await (await import('../models/index.js')).PointsLog.aggregate([
      { $match: { createdAt: { $gte: dateFilter } } },
      { $group: { _id: '$user', pts: { $sum: '$points' } } },
      { $sort:  { pts: -1 } },
      { $limit: 50 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
    ]);

    leaderboard = agg.map((r, i) => ({
      rank: i + 1, id: r.user._id, name: r.user.name, college: r.user.college,
      initials: r.user.avatar?.initials || r.user.name.slice(0, 2).toUpperCase(),
      avatarUrl: r.user.avatar?.url || '',
      pts: r.pts,
      badges: badges(i + 1, r.pts),
    }));
  }

  const podium = leaderboard.length >= 3
    ? [leaderboard[1], leaderboard[0], leaderboard[2]]
    : leaderboard.slice(0, 3);

  let myRank = null;
  if (req.user) {
    myRank = leaderboard.find(r => String(r.id) === String(req.user._id)) || null;
  }

  return ok(res, { leaderboard, podium, myRank, rules: POINTS_RULES, period });
});

// ─────────────────────────────────────────────────────────────────────────

// controllers/collegeController.js
import { College as CollegeModel } from '../models/index.js';
import Event from '../models/Event.js';

export const listColleges = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const filter = q ? { $text: { $search: q } } : {};
  const colleges = await CollegeModel.find(filter).sort({ name: 1 }).limit(30).lean();
  return ok(res, { colleges });
});

export const myCollege = asyncHandler(async (req, res) => {
  const collegeName = req.query.college || req.user?.college;
  if (!collegeName) return fail(res, 'college param or auth required', 400);

  const [college, events, studentCount] = await Promise.all([
    CollegeModel.findOne({ name: collegeName }).lean(),
    Event.find({ college: collegeName, isActive: true }).sort({ createdAt: -1 }).lean(),
    User.countDocuments({ college: collegeName }),
  ]);
  return ok(res, { college: college || { name: collegeName }, events, studentCount });
});

export const setMyCollege = asyncHandler(async (req, res) => {
  const { college } = req.body;
  if (!college) return fail(res, 'college is required');
  await User.findByIdAndUpdate(req.user._id, { college });
  return ok(res, { college }, 'College updated');
});

// ─────────────────────────────────────────────────────────────────────────

// controllers/supportController.js
import { SupportTicket } from '../models/index.js';

const FAQS = [
  { id: 'f1', category: 'registration', q: 'How do I register for an event?', a: "Tap any event card to open its detail page, then tap 'Register Now'. You'll need a FestNest account — registration takes under 60 seconds." },
  { id: 'f2', category: 'registration', q: 'Can I register for multiple events?', a: 'Yes! There is no limit. Browse the home feed, save the ones you like, then register from your Saved tab.' },
  { id: 'f3', category: 'organiser', q: 'How do I list my college event on FestNest?', a: "Go to Host Event from the sidebar, fill the multi-step form, and submit. Our team reviews within 48 hours. You earn 300 FestNest points when approved." },
  { id: 'f4', category: 'organiser', q: 'Is there a fee for listing?', a: 'Listing is completely free for verified college clubs and cells.' },
  { id: 'f5', category: 'account', q: 'How do FestNest points work?', a: 'You earn points for registering (+50), attending (+150), winning (+500), referring friends (+75), and hosting (+300).' },
  { id: 'f6', category: 'account', q: 'I forgot my password. What do I do?', a: "On the login screen tap 'Forgot password'. Enter your email, receive a 6-digit OTP, and set a new password." },
  { id: 'f7', category: 'technical', q: 'Why am I not receiving notifications?', a: "Make sure notifications are enabled in Profile → Notification Preferences and in your device's notification settings." },
  { id: 'f8', category: 'technical', q: 'The app is slow or not loading events.', a: 'Try pulling down to refresh. If the issue persists, clear the app cache or contact support below.' },
];

export const getFaqs = asyncHandler(async (req, res) => {
  const { category } = req.query;
  const faqs = category && category !== 'all' ? FAQS.filter(f => f.category === category) : FAQS;
  return ok(res, { faqs });
});

export const submitTicket = asyncHandler(async (req, res) => {
  const { name, email, issueType, subject, message } = req.body;
  if (!name || !email || !issueType || !subject || !message)
    return fail(res, 'name, email, issueType, subject and message are required');
  if (message.length < 10) return fail(res, 'Message must be at least 10 characters');

  const ticket = await SupportTicket.create({
    user: req.user?._id || null,
    name, email, issueType, subject, message,
  });
  return created(res, { ticket }, 'Your message has been received. We will get back to you within 24 hours.');
});

export const myTickets = asyncHandler(async (req, res) => {
  const tickets = await SupportTicket.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  return ok(res, { tickets });
});
