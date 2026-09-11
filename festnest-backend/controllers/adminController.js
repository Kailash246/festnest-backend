// controllers/adminController.js
import Event      from '../models/Event.js';
import User       from '../models/User.js';
import CampusAmbassador from '../models/CampusAmbassador.js';
import { HostedEvent, Notification, Registration, SavedEvent,
         SupportTicket, PointsLog, College, Feedback, CAReferralLog } from '../models/index.js';
import { getCityCode, calculateTier, computeImpactStats } from './caController.js';
import { sendMail, sendAmbassadorApprovedEmail } from '../utils/email.js';
import { ok, created, fail, notFoundRes, asyncHandler } from '../utils/response.js';

/* ═══════════════════════════════════════════════════════════
   DASHBOARD STATS
   GET /api/admin/stats
═══════════════════════════════════════════════════════════ */
export const getDashboardStats = asyncHandler(async (_req, res) => {
  const [
    totalUsers,
    totalEvents,
    pendingSubmissions,
    pendingAmbassadors,
    totalRegistrations,
    openTickets,
    totalFeedback,
    recentUsers,
    recentSubmissions,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Event.countDocuments({ isActive: true }),
    HostedEvent.countDocuments({ status: 'pending' }),
    CampusAmbassador.countDocuments({ status: { $in: ['applied', 'screening'] } }),
    Registration.countDocuments({}),
    SupportTicket.countDocuments({ status: 'open' }),
    Feedback.countDocuments({}),
    User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(5)
        .select('name email college createdAt').lean(),
    HostedEvent.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5)
        .populate('submittedBy', 'name email').lean(),
  ]);

  // Events by category breakdown
  const categoryBreakdown = await Event.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort:  { count: -1 } },
  ]);

  // Registrations over last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const registrationsTrend = await Registration.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
    }},
    { $sort: { _id: 1 } },
  ]);

  return ok(res, {
    totals: { totalUsers, totalEvents, pendingSubmissions, pendingAmbassadors, totalRegistrations, openTickets, totalFeedback },
    categoryBreakdown,
    registrationsTrend,
    recentUsers,
    recentSubmissions,
  });
});

/* ═══════════════════════════════════════════════════════════
   HOSTED EVENT SUBMISSIONS
═══════════════════════════════════════════════════════════ */

/**
 * GET /api/admin/submissions
 * Query: status (pending|approved|rejected|all), page, limit
 */
export const listSubmissions = asyncHandler(async (req, res) => {
  const { status = 'pending', page = 1, limit = 20 } = req.query;
  const filter = status !== 'all' ? { status } : {};
  const skip   = (Number(page) - 1) * Number(limit);

  const [submissions, total] = await Promise.all([
    HostedEvent.find(filter)
      .populate('submittedBy', 'name email college')
      .populate('linkedEvent', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    HostedEvent.countDocuments(filter),
  ]);

  return ok(res, { submissions, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/**
 * GET /api/admin/submissions/:id
 */
export const getSubmission = asyncHandler(async (req, res) => {
  const submission = await HostedEvent.findById(req.params.id)
    .populate('submittedBy', 'name email college city')
    .populate('linkedEvent').lean();
  if (!submission) return notFoundRes(res, 'Submission not found');
  return ok(res, { submission });
});

/**
 * POST /api/admin/submissions/:id/approve
 * Body (optional overrides): { name, category, entryType, tags, highlights, about, ... }
 *
 * Creates a live Event from the HostedEvent data, links it back,
 * notifies the submitter, and awards the 300-point bonus if not already given.
 */
export const approveSubmission = asyncHandler(async (req, res) => {
  const submission = await HostedEvent.findById(req.params.id)
    .populate('submittedBy', 'name email');
  if (!submission) return notFoundRes(res, 'Submission not found');
  if (submission.status === 'approved')
    return fail(res, 'Submission already approved');

  // Build slug from event name + random suffix
  const baseSlug = submission.eventName
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  // Admin can override any field via request body
  const overrides = req.body || {};

  // Map HostedEvent → Event
  const entryType = submission.isPaid ? 'paid'
    : submission.hasPrize ? 'prize'
    : 'free';

  // Compute days until event start so deadlineDays is accurate at publish time
  const _startDate = new Date(submission.startDate);
  const _deadlineDays = !isNaN(_startDate)
    ? Math.max(0, Math.ceil((_startDate - Date.now()) / 86400000))
    : 0;

  const event = await Event.create({
    slug,
    name:      overrides.name      || submission.eventName,
    category:  overrides.category  || submission.eventType || 'Other',
    entryType: overrides.entryType || entryType,
    organiser: {
      name:     overrides.organiserName || submission.submittedBy.name,
      location: submission.city,
      sub:      submission.college,
    },
    college:   submission.college,
    city:      submission.city,
    date: {
      start:        submission.startDate,
      end:          submission.endDate   || '',
      time:         overrides.time       || '',
      deadlineDays: _deadlineDays,
    },
    venue:    submission.venue,
    teamSize: submission.teamSize,
    badge: {
      text:  overrides.badgeText  || (submission.hasPrize ? `🏆 ${submission.prizeDetails}` : submission.isPaid ? `₹${submission.entryFee} Entry` : 'Free Entry'),
      class: overrides.badgeClass || (submission.hasPrize ? 'badge-prize' : submission.isPaid ? 'badge-paid' : 'badge-free'),
    },
    price: {
      display: submission.isPaid ? `₹${submission.entryFee}` : 'Free',
      note:    overrides.priceNote || (submission.isPaid ? 'per team' : 'to register'),
    },
    image: {
      url:      submission.bannerImage?.url      || '',
      publicId: submission.bannerImage?.publicId || '',
    },
    brochure: {
      url:      submission.brochure?.url      || '',
      publicId: submission.brochure?.publicId || '',
    },
    tags:            overrides.tags       || [],
    highlights:      overrides.highlights || [],
    about:           overrides.about      || submission.about,
    registrationUrl: submission.registrationUrl || '#',
    // Extended fields from the submission form
    ...(submission.prize1     && { prize1:      submission.prize1 }),
    ...(submission.prize2     && { prize2:      submission.prize2 }),
    ...(submission.prize3     && { prize3:      submission.prize3 }),
    ...(submission.totalPrize && { totalPrize:  submission.totalPrize }),
    ...(submission.pocName    && { pocName:     submission.pocName }),
    ...(submission.pocPhone   && { pocPhone:    submission.pocPhone }),
    ...(submission.pocEmail   && { pocEmail:    submission.pocEmail }),
    ...(submission.website    && { website:     submission.website }),
    ...(submission.eligibility&& { eligibility: submission.eligibility }),
    ...(submission.rules      && { rules:       submission.rules }),
    ...(submission.perks      && { perks:       submission.perks }),
    ...(submission.mode       && { mode:        submission.mode }),
    hostedBy:        submission.submittedBy._id,
    isActive:        true,
    isApproved:      true,
    isFeatured:      overrides.isFeatured    === true,
    featuredOrder:   typeof overrides.featuredOrder === 'number' ? overrides.featuredOrder : 0,
  });

  // Link back to submission
  submission.status      = 'approved';
  submission.linkedEvent = event._id;
  await submission.save();

  // In-app notification to submitter
  await Notification.create({
    user:  submission.submittedBy._id,
    type:  'updates',
    icon:  '🎉',
    bg:    'bg-[#F0FDF4]',
    title: 'Your event was approved!',
    sub:   `${submission.eventName} is now live on FestNest.`,
    ctaId: event._id.toString(),
  });

  // Email notification
  sendMail({
    to:      submission.submittedBy.email,
    subject: `🎉 Your event "${submission.eventName}" is live on FestNest!`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
        <h2 style="color:#4F46E5;">Your event is approved! 🎉</h2>
        <p>Hi ${submission.submittedBy.name},</p>
        <p><strong>${submission.eventName}</strong> has been reviewed and approved by the FestNest team.
           It is now live and visible to students across India.</p>
        <p style="margin-top:24px;color:#6B7280;font-size:13px;">
          The FestNest Team
        </p>
      </div>
    `,
  }).catch(err => console.error('Approval email error:', err.message));

  return ok(res, { event, submission }, `Event approved and published as "${event.name}"`);
});

/**
 * POST /api/admin/submissions/:id/reject
 * Body: { reason }
 */
export const rejectSubmission = asyncHandler(async (req, res) => {
  const { reason = 'Your submission did not meet our listing guidelines.' } = req.body;

  const submission = await HostedEvent.findById(req.params.id)
    .populate('submittedBy', 'name email');
  if (!submission) return notFoundRes(res, 'Submission not found');
  if (submission.status === 'rejected')
    return fail(res, 'Submission already rejected');

  submission.status = 'rejected';
  await submission.save();

  // In-app notification
  await Notification.create({
    user:  submission.submittedBy._id,
    type:  'updates',
    icon:  '❌',
    bg:    'bg-[#FFF1F2]',
    title: 'Event submission not approved',
    sub:   `${submission.eventName}: ${reason}`,
  });

  // Email
  sendMail({
    to:      submission.submittedBy.email,
    subject: `Update on your FestNest event submission: ${submission.eventName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
        <h2 style="color:#DC2626;">Submission not approved</h2>
        <p>Hi ${submission.submittedBy.name},</p>
        <p>After review, your event <strong>${submission.eventName}</strong> could not be approved at this time.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>You're welcome to revise and resubmit through the Host Event page.</p>
        <p style="margin-top:24px;color:#6B7280;font-size:13px;">The FestNest Team</p>
      </div>
    `,
  }).catch(err => console.error('Rejection email error:', err.message));

  return ok(res, { submission }, 'Submission rejected');
});

/* ═══════════════════════════════════════════════════════════
   LIVE EVENT MANAGEMENT
═══════════════════════════════════════════════════════════ */

/** GET /api/admin/events  — all events including inactive */
export const listAllEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, category, isActive } = req.query;
  const filter = {};
  if (search)   filter.$text = { $search: search };
  if (category) filter.category = category;
  if (isActive !== undefined) filter.isActive = isActive === 'true';

  const skip = (Number(page) - 1) * Number(limit);
  const [events, total] = await Promise.all([
    Event.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Event.countDocuments(filter),
  ]);
  return ok(res, { events, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** POST /api/admin/events  — create event directly (no submission flow) */
export const createEvent = asyncHandler(async (req, res) => {
  const { name, category, entryType, college, city, startDate } = req.body;
  if (!name || !category || !entryType || !college || !city || !startDate)
    return fail(res, 'name, category, entryType, college, city and startDate are required');

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    + '-' + Date.now().toString(36);

  const event = await Event.create({ ...req.body, slug });
  return created(res, { event }, 'Event created');
});

/** PATCH /api/admin/events/:id  — edit any field */
export const updateEvent = asyncHandler(async (req, res) => {
  const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!event) return notFoundRes(res, 'Event not found');
  return ok(res, { event }, 'Event updated');
});

/** DELETE /api/admin/events/:id  — soft-delete (sets isActive: false) */
export const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!event) return notFoundRes(res, 'Event not found');
  return ok(res, { event }, 'Event deactivated');
});

/** PATCH /api/admin/events/:id/restore  — re-activate */
export const restoreEvent = asyncHandler(async (req, res) => {
  const event = await Event.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
  if (!event) return notFoundRes(res, 'Event not found');
  return ok(res, { event }, 'Event restored');
});

/** PATCH /api/admin/events/:id/feature  — set/unset featured (superadmin only) */
export const featureEvent = asyncHandler(async (req, res) => {
  const { isFeatured, featuredOrder } = req.body;
  if (typeof isFeatured !== 'boolean')
    return fail(res, 'isFeatured must be a boolean', 400);

  const update = { isFeatured };
  if (typeof featuredOrder === 'number') update.featuredOrder = featuredOrder;

  const event = await Event.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!event) return notFoundRes(res, 'Event not found');
  return ok(res, { event }, isFeatured ? 'Event marked as featured ⭐' : 'Event removed from featured');
});

/** DELETE /api/admin/events/:id/permanent  — hard-delete (superadmin only) */
export const permanentDeleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findByIdAndDelete(req.params.id);
  if (!event) return notFoundRes(res, 'Event not found');
  // Clean up related data
  await Promise.all([
    SavedEvent.deleteMany({ event: req.params.id }),
    Registration.deleteMany({ event: req.params.id }),
  ]);
  return ok(res, {}, `"${event.name}" permanently deleted`);
});

/* ═══════════════════════════════════════════════════════════
   USER MANAGEMENT
═══════════════════════════════════════════════════════════ */

/** GET /api/admin/users */
export const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, role } = req.query;
  const filter = {};
  if (search) {
    // Escape regex metacharacters so user input is matched literally (no ReDoS)
    const term = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name:  { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }
  if (role) filter.role = role;

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    User.countDocuments(filter),
  ]);
  return ok(res, { users, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** GET /api/admin/users/:id */
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password').lean();
  if (!user) return notFoundRes(res, 'User not found');

  const [registrations, savedCount, pointsLog, hostedEvents] = await Promise.all([
    Registration.find({ user: user._id }).populate('event', 'name slug city').lean(),
    SavedEvent.countDocuments({ user: user._id }),
    PointsLog.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
    HostedEvent.find({ submittedBy: user._id }).lean(),
  ]);

  return ok(res, { user, registrations, savedCount, pointsLog, hostedEvents });
});

/** PATCH /api/admin/users/:id/ban  — toggle ban */
export const toggleBanUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return notFoundRes(res, 'User not found');
  if (user.role === 'superadmin') return fail(res, 'Cannot ban a superadmin');

  user.isBanned = !user.isBanned;
  await user.save();
  return ok(res, { isBanned: user.isBanned }, `User ${user.isBanned ? 'banned' : 'unbanned'}`);
});

/** PATCH /api/admin/users/:id/role  — change role (superadmin only) */
export const setUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['user', 'organizer', 'admin', 'superadmin'].includes(role))
    return fail(res, 'role must be user, organizer, admin, or superadmin');

  const user = await User.findByIdAndUpdate(
    req.params.id, { role }, { new: true }
  ).select('-password');
  if (!user) return notFoundRes(res, 'User not found');
  return ok(res, { user }, `Role set to ${role}`);
});

/** PATCH /api/admin/users/:id/points  — manually adjust points */
export const adjustUserPoints = asyncHandler(async (req, res) => {
  const { points, reason = 'Admin adjustment' } = req.body;
  if (typeof points !== 'number') return fail(res, 'points must be a number');

  const user = await User.findByIdAndUpdate(
    req.params.id, { $inc: { points } }, { new: true }
  ).select('-password');
  if (!user) return notFoundRes(res, 'User not found');

  await PointsLog.create({
    user:        user._id,
    action:      points >= 0 ? 'attend' : 'register',
    points,
    description: reason,
  });

  return ok(res, { user, newTotal: user.points }, `Points adjusted by ${points}`);
});

/* ═══════════════════════════════════════════════════════════
   SUPPORT TICKETS
═══════════════════════════════════════════════════════════ */

/** GET /api/admin/tickets */
export const listTickets = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = status ? { status } : {};
  const skip   = (Number(page) - 1) * Number(limit);

  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    SupportTicket.countDocuments(filter),
  ]);
  return ok(res, { tickets, pagination: { total, page: Number(page), limit: Number(limit) } });
});

/** PATCH /api/admin/tickets/:id  — update status + optional reply */
export const updateTicket = asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body;
  if (!['open', 'in_progress', 'resolved'].includes(status))
    return fail(res, 'status must be open, in_progress, or resolved');
  if (status === 'resolved' && !adminNote?.trim())
    return fail(res, 'A response message is required to resolve a ticket');

  const updateOp = {
    $set: { status, ...(status === 'resolved' ? { resolvedAt: new Date() } : {}) },
  };
  if (adminNote?.trim()) {
    updateOp.$push = {
      replies: {
        author:   'admin',
        authorId: req.user._id,
        name:     req.user.name,
        message:  adminNote.trim(),
      },
    };
  }

  const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, updateOp, { new: true });
  if (!ticket) return notFoundRes(res, 'Ticket not found');

  // In-app notification for the linked user
  if (ticket.user) {
    const notifMap = {
      in_progress: {
        icon: '🔍', bg: 'bg-[#FFFBEB]',
        title: 'We\'re reviewing your request',
        sub:   `Your ticket "${ticket.subject}" is now in progress.`,
      },
      resolved: {
        icon: '✅', bg: 'bg-[#F0FDF4]',
        title: 'Support ticket resolved',
        sub:   adminNote.trim(),
      },
      open: {
        icon: '🔄', bg: 'bg-[#EEF2FF]',
        title: 'Your ticket has been reopened',
        sub:   `Your ticket "${ticket.subject}" is open again.`,
      },
    };
    const cfg = notifMap[status];
    if (cfg) {
      Notification.create({ user: ticket.user, type: 'system', ...cfg })
        .catch(err => console.error('Ticket notification error:', err.message));
    }
  }

  // Email is secondary — the primary response lives in the ticket thread
  if (status === 'resolved' && adminNote?.trim()) {
    sendMail({
      to:      ticket.email,
      subject: `Your FestNest support ticket has been resolved`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;">
          <h2 style="color:#4F46E5;">Ticket Resolved ✅</h2>
          <p>Hi ${ticket.name},</p>
          <p>Your support request regarding <strong>"${ticket.subject}"</strong> has been resolved.</p>
          <p><strong>Response from FestNest team:</strong><br>${adminNote.trim()}</p>
          <p style="color:#6B7280;font-size:13px;margin-top:24px;">You can also view this response inside FestNest under Support → My Tickets.</p>
          <p style="color:#6B7280;font-size:13px;">The FestNest Team</p>
        </div>
      `,
    }).catch(err => console.error('Ticket resolve email error:', err.message));
  }

  return ok(res, { ticket }, `Ticket marked as ${status}`);
});


/* ═══════════════════════════════════════════════════════════
   COLLEGE MANAGEMENT
═══════════════════════════════════════════════════════════ */

/** POST /api/admin/colleges */
export const addCollege = asyncHandler(async (req, res) => {
  const { name, city, state, logoEmoji, pastEvents } = req.body;
  if (!name || !city || !state) return fail(res, 'name, city and state are required');
  const college = await College.create({ name, city, state, logoEmoji, pastEvents });
  return created(res, { college }, 'College added');
});

/** PATCH /api/admin/colleges/:id */
export const updateCollege = asyncHandler(async (req, res) => {
  const college = await College.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!college) return notFoundRes(res, 'College not found');
  return ok(res, { college }, 'College updated');
});

/** DELETE /api/admin/colleges/:id */
export const deleteCollege = asyncHandler(async (req, res) => {
  await College.findByIdAndDelete(req.params.id);
  return ok(res, {}, 'College deleted');
});

/* ═══════════════════════════════════════════════════════════
   BROADCAST NOTIFICATION
═══════════════════════════════════════════════════════════ */

/**
 * POST /api/admin/notify
 * Body: { title, sub, type, icon, bg, userIds? }
 * If userIds is omitted → sends to ALL users.
 */
export const broadcastNotification = asyncHandler(async (req, res) => {
  const { title, sub = '', type = 'system', icon = '📢', bg = 'bg-[#EEF2FF]', userIds } = req.body;
  if (!title) return fail(res, 'title is required');

  let targetIds = userIds;
  if (!targetIds || !targetIds.length) {
    const users = await User.find({}).select('_id').lean();
    targetIds   = users.map(u => u._id);
  }

  const docs = targetIds.map(uid => ({ user: uid, type, icon, bg, title, sub }));
  await Notification.insertMany(docs);

  return ok(res, { sent: docs.length }, `Notification sent to ${docs.length} user(s)`);
});

/* ═══════════════════════════════════════════════════════════
   CAMPUS AMBASSADOR MANAGEMENT
═══════════════════════════════════════════════════════════ */

/**
 * GET /api/admin/ca
 * List ambassador applications with filtering, search, pagination, and status counts
 */
export const listAmbassadors = asyncHandler(async (req, res) => {
  const {
    status,
    tier,
    city,
    search,
    q,
    sortBy,
    sortDir,
    sort = 'newest',
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};
  if (status && status !== 'all') {
    if (status === 'pending') {
      filter.status = { $in: ['applied', 'screening'] };
    } else {
      filter.status = status;
    }
  }

  if (tier && tier !== 'all') {
    filter.tier = tier;
  }

  if (city && city.trim()) {
    filter.city = new RegExp(city.trim(), 'i');
  }

  const querySearch = (search || q || '').trim();
  if (querySearch) {
    const rx = new RegExp(querySearch, 'i');
    filter.$or = [
      { name: rx },
      { college: rx },
      { city: rx },
      { email: rx },
      { caId: rx },
      { referralCode: rx },
    ];
  }

  let sortCriteria = { createdAt: -1 };
  if (sortBy) {
    const direction = String(sortDir).toLowerCase() === 'asc' ? 1 : -1;
    switch (sortBy) {
      case 'organizersOnboarded':
        sortCriteria = { 'stats.organizersOnboarded': direction, createdAt: -1 };
        break;
      case 'eventsSourced':
        sortCriteria = { 'stats.eventsSourced': direction, createdAt: -1 };
        break;
      case 'referralSignups':
        sortCriteria = { 'stats.referralSignups': direction, createdAt: -1 };
        break;
      case 'name':
        sortCriteria = { name: direction };
        break;
      case 'college':
        sortCriteria = { college: direction };
        break;
      case 'city':
        sortCriteria = { city: direction };
        break;
      case 'tier':
        sortCriteria = { tier: direction };
        break;
      case 'status':
        sortCriteria = { status: direction };
        break;
      case 'createdAt':
      case 'appliedAt':
        sortCriteria = { createdAt: direction };
        break;
      default:
        sortCriteria = { createdAt: direction };
    }
  } else {
    if (sort === 'oldest') sortCriteria = { createdAt: 1 };
    if (sort === 'name') sortCriteria = { name: 1 };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [ambassadors, total, counts] = await Promise.all([
    CampusAmbassador.find(filter)
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    CampusAmbassador.countDocuments(filter),
    Promise.all([
      CampusAmbassador.countDocuments({}),
      CampusAmbassador.countDocuments({ status: { $in: ['applied', 'screening'] } }),
      CampusAmbassador.countDocuments({ status: 'approved' }),
      CampusAmbassador.countDocuments({ status: 'rejected' }),
    ]).then(([all, pending, approved, rejected]) => ({ all, pending, approved, rejected })),
  ]);

  return ok(res, {
    ambassadors,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
    counts,
  });
});

/**
 * GET /api/admin/ca/:id
 * Retrieve single ambassador profile with full audit log and computed platform stats
 */
export const getAmbassador = asyncHandler(async (req, res) => {
  const ca = await CampusAmbassador.findById(req.params.id);
  if (!ca) return notFoundRes(res, 'Ambassador application not found');

  const stats = await computeImpactStats(ca);
  return ok(res, { ambassador: ca, stats });
});

/**
 * PATCH /api/admin/ca/:id/approve
 * Server-side approval generating deterministic caId, referral code, validity, and audit trail
 */
export const approveAmbassador = asyncHandler(async (req, res) => {
  const ca = await CampusAmbassador.findById(req.params.id);
  if (!ca) return notFoundRes(res, 'Ambassador application not found');

  if (ca.status === 'approved') {
    return fail(res, 'This applicant has already been approved');
  }

  if (ca.status === 'rejected' && !req.body.allowReopen) {
    return fail(res, 'Application was previously rejected. Check "Reopen & Approve" to override.');
  }

  const cityCode = getCityCode(ca.city);
  ca.cityCode = cityCode;

  // Server-side deterministic sequential ID generation:
  // Count existing approved ambassadors with this city code
  const cityCount = await CampusAmbassador.countDocuments({
    cityCode,
    status: 'approved',
    _id: { $ne: ca._id },
  });
  const seq = cityCount + 1;
  const caId = `FN-CA-${cityCode}-${String(seq).padStart(3, '0')}`;
  const referralCode = `FN-${cityCode}-${String(seq).padStart(3, '0')}`;

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear() + 2; // 2 years valid
  const validThru = `${month} / ${year}`;

  ca.caId = caId;
  ca.referralCode = referralCode;
  ca.validThru = validThru;
  ca.status = 'approved';
  ca.tier = 'Bronze';
  ca.approvedAt = now;
  ca.rejectedAt = null;
  ca.rejectionReason = '';

  // Link user if matching account exists
  if (!ca.userId) {
    const user = await User.findOne({ email: ca.email }).select('_id').lean();
    if (user) ca.userId = user._id;
  }

  ca.auditLog.push({
    action: 'approved',
    by: req.user._id,
    byName: req.user.name || 'Admin',
    date: now,
    notes: req.body.notes || 'Application approved and credentials generated',
    meta: { caId, referralCode, validThru },
  });

  await ca.save();

  sendAmbassadorApprovedEmail({
    email: ca.email,
    name: ca.name,
    caId,
    referralCode,
  }).catch(err => {
    console.error('[Admin CA Approval Email Error]', err.message);
  });

  return ok(res, { ambassador: ca }, `Approved ${ca.name} with ID ${caId}`);
});

/**
 * PATCH /api/admin/ca/:id/reject
 * Reject application with mandatory or provided reason and audit logging
 */
export const rejectAmbassador = asyncHandler(async (req, res) => {
  const { reason = 'Application does not meet current criteria', notes = '' } = req.body;
  const ca = await CampusAmbassador.findById(req.params.id);
  if (!ca) return notFoundRes(res, 'Ambassador application not found');

  if (ca.status === 'rejected') {
    return fail(res, 'This applicant has already been rejected');
  }

  const now = new Date();
  ca.status = 'rejected';
  ca.rejectedAt = now;
  ca.rejectionReason = reason;

  ca.auditLog.push({
    action: 'rejected',
    by: req.user._id,
    byName: req.user.name || 'Admin',
    date: now,
    notes: reason + (notes ? ` (${notes})` : ''),
  });

  await ca.save();
  return ok(res, { ambassador: ca }, 'Application rejected');
});

/**
 * PATCH /api/admin/ca/:id/status
 * Transition status (e.g. to 'screening' or back to 'applied') with audit notes
 */
export const updateAmbassadorStatus = asyncHandler(async (req, res) => {
  const { status, notes = '' } = req.body;
  if (!['applied', 'screening'].includes(status)) {
    return fail(res, 'Use dedicated approve/reject endpoints for final decisions');
  }

  const ca = await CampusAmbassador.findById(req.params.id);
  if (!ca) return notFoundRes(res, 'Ambassador application not found');

  ca.status = status;
  ca.auditLog.push({
    action: status,
    by: req.user._id,
    byName: req.user.name || 'Admin',
    date: new Date(),
    notes,
  });

  await ca.save();
  return ok(res, { ambassador: ca }, `Status moved to ${status}`);
});

/**
 * PATCH /api/admin/ca/:id/adjust
 * Adjust manual metric overrides with mandatory audit reason
 */
export const adjustAmbassadorStats = asyncHandler(async (req, res) => {
  const { organizersOnboarded, eventsSourced, referralSignups, reason } = req.body;
  if (!reason || !reason.trim()) {
    return fail(res, 'An audit reason is required for manual metric adjustments');
  }

  const ca = await CampusAmbassador.findById(req.params.id);
  if (!ca) return notFoundRes(res, 'Ambassador not found');

  if (!ca.adjustments) {
    ca.adjustments = { organizersOnboarded: 0, eventsSourced: 0, referralSignups: 0 };
  }

  if (typeof organizersOnboarded === 'number') ca.adjustments.organizersOnboarded = organizersOnboarded;
  if (typeof eventsSourced === 'number') ca.adjustments.eventsSourced = eventsSourced;
  if (typeof referralSignups === 'number') ca.adjustments.referralSignups = referralSignups;

  // Recompute live stats to update tier
  const live = await computeImpactStats(ca);
  ca.tier = live.tier;

  ca.auditLog.push({
    action: 'stat_adjustment',
    by: req.user._id,
    byName: req.user.name || 'Admin',
    date: new Date(),
    notes: reason.trim(),
    meta: { adjustments: ca.adjustments, computedTier: live.tier },
  });

  await ca.save();
  return ok(res, { ambassador: ca, stats: live }, 'Ambassador metrics updated with audit record');
});

/**
 * GET /api/admin/ca/:id/impact
 * Paginated referral ledger entries for a specific ambassador
 */
export const getAmbassadorImpact = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ca = await CampusAmbassador.findById(id);
  if (!ca) return notFoundRes(res, 'Ambassador not found');

  const { page = 1, limit = 20, type } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = { caId: ca._id };
  if (type && ['organizer', 'event', 'student'].includes(type)) {
    filter.type = type;
  }

  const [logs, total] = await Promise.all([
    CAReferralLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    CAReferralLog.countDocuments(filter),
  ]);

  return ok(res, {
    logs,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
  });
});

/* ═══════════════════════════════════════════════════════════
   USER FEEDBACK MANAGEMENT
═══════════════════════════════════════════════════════════ */

/** GET /api/admin/feedback — List user feedback with filters, search, pagination, and counts */
export const listFeedback = asyncHandler(async (req, res) => {
  const { category, q, sort = 'newest', page = 1, limit = 20 } = req.query;

  const filter = {};
  if (category && category !== 'all') {
    filter.category = category;
  }

  if (q && q.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { message: rx },
      { email: rx },
      { page: rx },
    ];
  }

  let sortCriteria = { createdAt: -1 };
  if (sort === 'oldest') sortCriteria = { createdAt: 1 };
  if (sort === 'rating_high') sortCriteria = { rating: -1, createdAt: -1 };
  if (sort === 'rating_low') sortCriteria = { rating: 1, createdAt: -1 };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [feedback, total, counts] = await Promise.all([
    Feedback.find(filter)
      .populate('userId', 'name email role college')
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Feedback.countDocuments(filter),
    Promise.all([
      Feedback.countDocuments({}),
      Feedback.countDocuments({ category: 'bug' }),
      Feedback.countDocuments({ category: 'ui_ux' }),
      Feedback.countDocuments({ category: 'feature_request' }),
      Feedback.countDocuments({ category: 'event_discovery' }),
      Feedback.countDocuments({ category: 'suggestion' }),
      Feedback.countDocuments({ category: 'other' }),
    ]).then(([all, bug, ui_ux, feature_request, event_discovery, suggestion, other]) => ({
      all,
      bug,
      ui_ux,
      feature_request,
      event_discovery,
      suggestion,
      other,
    })),
  ]);

  return ok(res, {
    feedback,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    },
    counts,
  });
});

/** GET /api/admin/feedback/:id — Single feedback detail */
export const getFeedback = asyncHandler(async (req, res) => {
  const item = await Feedback.findById(req.params.id)
    .populate('userId', 'name email role college')
    .lean();
  if (!item) return notFoundRes(res, 'Feedback not found');
  return ok(res, { feedback: item });
});

/** DELETE /api/admin/feedback/:id — Delete feedback entry */
export const deleteFeedback = asyncHandler(async (req, res) => {
  const item = await Feedback.findByIdAndDelete(req.params.id);
  if (!item) return notFoundRes(res, 'Feedback not found');
  return ok(res, {}, 'Feedback entry deleted');
});

