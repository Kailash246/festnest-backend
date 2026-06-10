// controllers/adminController.js
import Event      from '../models/Event.js';
import User       from '../models/User.js';
import { HostedEvent, Notification, Registration, SavedEvent,
         SupportTicket, PointsLog, College } from '../models/index.js';
import { sendMail }       from '../utils/email.js';
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
    totalRegistrations,
    openTickets,
    recentUsers,
    recentSubmissions,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Event.countDocuments({ isActive: true }),
    HostedEvent.countDocuments({ status: 'pending' }),
    Registration.countDocuments({}),
    SupportTicket.countDocuments({ status: 'open' }),
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
    totals: { totalUsers, totalEvents, pendingSubmissions, totalRegistrations, openTickets },
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
  if (search) filter.$or = [
    { name:  { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
  ];
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
  if (!['user', 'admin', 'superadmin'].includes(role))
    return fail(res, 'role must be user, admin, or superadmin');

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
