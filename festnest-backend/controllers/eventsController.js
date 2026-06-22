// controllers/eventsController.js
import mongoose     from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import Event        from '../models/Event.js';
import { SavedEvent, Registration, Notification, PointsLog, HostedEvent } from '../models/index.js';
import User         from '../models/User.js';
import { cloudinary, uploadEventBanner, uploadBrochure } from '../config/cloudinary.js';
import { sendRegistrationConfirmEmail } from '../utils/email.js';
import { ok, created, fail, notFoundRes, asyncHandler } from '../utils/response.js';

// Strip all HTML tags — returns plain text safe for DB storage
const STRIP_ALL = { allowedTags: [], allowedAttributes: {} };
const clean = str => (str ? sanitizeHtml(String(str), STRIP_ALL) : str);

// Recompute deadlineDays dynamically from date.start when it's a parseable ISO date.
// Seeded events with human-readable dates (e.g. "18–19 May 2025") are skipped and
// keep whatever value is stored in the DB.
function withDeadlineDays(ev) {
  if (!ev?.date?.start) return ev;
  const d = new Date(ev.date.start);
  if (isNaN(d)) return ev;
  const days = Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  return { ...ev, date: { ...ev.date, deadlineDays: days } };
}

/* ────────────────────────────────────────────────────────
   GET /api/events
   Query: category, entryType, city, search, sort, page, limit
──────────────────────────────────────────────────────── */
export const listEvents = asyncHandler(async (req, res) => {
  const { category, entryType, city, search, sort = 'trending', page = 1, limit = 20 } = req.query;

  const filter = { isActive: true, isApproved: true };

  if (category && category !== 'all') {
    // Handle quick-filter aliases
    if (category === 'free')  filter.entryType = 'free';
    else if (category === 'prize') filter.entryType = 'prize';
    else filter.category = category;
  }
  if (entryType) filter.entryType = entryType;
  if (city && city !== 'All Cities') {
    // Case-insensitive exact match so SEO slugs ("chennai") match stored values
    // ("Chennai"). Hyphens in URL slugs are treated as spaces ("new-delhi" → "New Delhi").
    const term = String(city).trim().replace(/-/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.city = new RegExp(`^${term}$`, 'i');
  }
  if (search) filter.$text = { $search: search };

  const sortMap = {
    trending:   { 'trending.rank': 1 },
    latest:     { createdAt: -1 },
    oldest:     { createdAt: 1 },
    registered: { 'stats.registrationCount': -1 },
    deadline:   { 'date.deadlineDays': 1 },
  };
  const sortObj = sortMap[sort] || sortMap.trending;

  const skip  = (Number(page) - 1) * Number(limit);
  const [events, total] = await Promise.all([
    Event.find(filter).sort(sortObj).skip(skip).limit(Number(limit)).lean(),
    Event.countDocuments(filter),
  ]);

  return ok(res, {
    events: events.map(withDeadlineDays),
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
  });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/trending
──────────────────────────────────────────────────────── */
export const trendingEvents = asyncHandler(async (_req, res) => {
  const events = await Event.find({ isActive: true, 'trending.rank': { $ne: null } })
    .sort({ 'trending.rank': 1 }).limit(5).lean();
  return ok(res, { events: events.map(withDeadlineDays) });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/featured
──────────────────────────────────────────────────────── */
export const featuredEvents = asyncHandler(async (_req, res) => {
  const events = await Event.find({ isActive: true, isApproved: true, isFeatured: true })
    .sort({ featuredOrder: 1, createdAt: -1 })
    .limit(6)
    .lean();
  return ok(res, { events: events.map(withDeadlineDays) });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/urgent
──────────────────────────────────────────────────────── */
export const urgentEvents = asyncHandler(async (_req, res) => {
  const events = await Event.find({ isActive: true })
    .sort({ 'date.deadlineDays': 1 }).limit(4).lean();
  return ok(res, { events: events.map(withDeadlineDays) });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/saved   (auth required)
──────────────────────────────────────────────────────── */
export const savedEvents = asyncHandler(async (req, res) => {
  const saved = await SavedEvent.find({ user: req.user._id })
    .populate('event').sort({ createdAt: -1 }).lean();
  return ok(res, { events: saved.map(s => s.event).filter(Boolean).map(withDeadlineDays) });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/:slug
   Admins can view any event regardless of isActive status.
──────────────────────────────────────────────────────── */
export const getEvent = asyncHandler(async (req, res) => {
  const isAdminPreview = req.user?.role === 'admin' || req.user?.role === 'superadmin';

  // Admins can view inactive events; regular users only see active ones
  const slugFilter = { slug: req.params.slug };
  if (!isAdminPreview) slugFilter.isActive = true;

  // Only increment view count for public (non-admin) views
  let event;
  if (isAdminPreview) {
    event = await Event.findOne(slugFilter).lean();
  } else {
    event = await Event.findOneAndUpdate(
      slugFilter,
      { $inc: { 'stats.viewCount': 1 } },
      { new: true }
    ).lean();
  }

  // Fallback: if no slug match and param looks like an ObjectId, try _id lookup
  if (!event && mongoose.Types.ObjectId.isValid(req.params.slug)) {
    const idFilter = { _id: req.params.slug };
    if (!isAdminPreview) idFilter.isActive = true;
    if (isAdminPreview) {
      event = await Event.findOne(idFilter).lean();
    } else {
      event = await Event.findOneAndUpdate(
        idFilter,
        { $inc: { 'stats.viewCount': 1 } },
        { new: true }
      ).lean();
    }
  }

  if (!event) return notFoundRes(res, 'Event not found');

  const related = await Event.find({
    category: event.category,
    _id: { $ne: event._id },
    isActive: true,
  }).limit(4).lean();

  let isSaved = false;
  if (req.user) {
    isSaved = !!(await SavedEvent.findOne({ user: req.user._id, event: event._id }));
  }

  return ok(res, { event: withDeadlineDays(event), related: related.map(withDeadlineDays), isSaved });
});

/* ────────────────────────────────────────────────────────
   POST /api/events/:slug/save   (auth required)
──────────────────────────────────────────────────────── */
export const saveEvent = asyncHandler(async (req, res) => {
  const event = await Event.findOne({ slug: req.params.slug });
  if (!event) return notFoundRes(res, 'Event not found');

  await SavedEvent.findOneAndUpdate(
    { user: req.user._id, event: event._id },
    { user: req.user._id, event: event._id },
    { upsert: true, new: true }
  );
  return ok(res, { saved: true }, 'Event saved');
});

/* ────────────────────────────────────────────────────────
   DELETE /api/events/:slug/save   (auth required)
──────────────────────────────────────────────────────── */
export const unsaveEvent = asyncHandler(async (req, res) => {
  const event = await Event.findOne({ slug: req.params.slug });
  if (event) await SavedEvent.deleteOne({ user: req.user._id, event: event._id });
  return ok(res, { saved: false }, 'Event removed from saved');
});

/* ────────────────────────────────────────────────────────
   POST /api/events/:slug/register   (auth required)
──────────────────────────────────────────────────────── */
export const registerForEvent = asyncHandler(async (req, res) => {
  const event = await Event.findOne({ slug: req.params.slug, isActive: true });
  if (!event) return notFoundRes(res, 'Event not found');

  const existing = await Registration.findOne({ user: req.user._id, event: event._id });
  if (existing) return ok(res, { registration: existing }, 'Already registered');

  const registration = await Registration.create({ user: req.user._id, event: event._id });

  // Increment event registration count
  await Event.findByIdAndUpdate(event._id, { $inc: { 'stats.registrationCount': 1 } });

  // Award points
  await PointsLog.create({ user: req.user._id, action: 'register', points: 50, event: event._id, description: `Registered for ${event.name}` });
  await User.findByIdAndUpdate(req.user._id, { $inc: { points: 50 } });

  // In-app notification
  await Notification.create({
    user: req.user._id, type: 'updates', icon: '✅', bg: 'bg-[#EEF2FF]',
    title: 'Registration confirmed!',
    sub: `You're all set for ${event.name} at ${event.college}.`,
    ctaId: event._id.toString(),
  });

  // Confirmation email (non-blocking)
  sendRegistrationConfirmEmail(req.user.email, req.user.name, event.name, event.college)
    .catch(err => console.error('Email error:', err.message));

  return created(res, { registration, pointsEarned: 50 }, 'Registered successfully');
});

/* ────────────────────────────────────────────────────────
   DELETE /api/events/:slug/register   (auth required)
──────────────────────────────────────────────────────── */
export const cancelRegistration = asyncHandler(async (req, res) => {
  const event = await Event.findOne({ slug: req.params.slug });
  if (event) {
    await Registration.deleteOne({ user: req.user._id, event: event._id });
    await Event.findByIdAndUpdate(event._id, { $inc: { 'stats.registrationCount': -1 } });
  }
  return ok(res, {}, 'Registration cancelled');
});

/* ────────────────────────────────────────────────────────
   POST /api/events/host   (auth required, optional image upload)
   multipart/form-data with optional `bannerImage` file
──────────────────────────────────────────────────────── */
export const hostEvent = asyncHandler(async (req, res) => {
  const {
    eventName, college, eventType, startDate, endDate = '', city,
    venue = '', teamSize = '', mode = 'Offline',
    hasPrize = false, prizeDetails = '',
    prize1 = '', prize2 = '', prize3 = '', totalPrize = '',
    isPaid = false, entryFee = '', about = '', registrationUrl = '',
    eligibility = '', rules = '', perks = '',
    pocName = '', pocPhone = '', pocEmail = '', website = '',
  } = req.body;

  if (!eventName || !college || !eventType || !startDate || !city)
    return fail(res, 'eventName, college, eventType, startDate and city are required');

  const files        = req.files || {};
  const bannerFile   = req.file || files.bannerImage?.[0];
  const brochureFile = files.brochure?.[0];

  // Enforce 5 MB limit specifically for banner images
  if (bannerFile && bannerFile.size > 5 * 1024 * 1024)
    return fail(res, 'Poster image must be 5 MB or smaller', 400);

  const [bannerResult, brochureResult] = await Promise.all([
    bannerFile   ? uploadEventBanner(bannerFile.buffer)  : null,
    brochureFile ? uploadBrochure(brochureFile.buffer)   : null,
  ]);

  const bannerImage = bannerResult
    ? { url: bannerResult.secure_url, publicId: bannerResult.public_id }
    : { url: '', publicId: '' };

  const brochure = brochureResult
    ? { url: brochureResult.secure_url, publicId: brochureResult.public_id }
    : { url: '', publicId: '' };

  // Sanitize all user-supplied text fields before persisting
  const hosted = await HostedEvent.create({
    submittedBy:  req.user._id,
    eventName: clean(eventName), college: clean(college), eventType: clean(eventType),
    startDate, endDate, city: clean(city),
    venue: clean(venue), teamSize, mode,
    hasPrize:     hasPrize === 'true' || hasPrize === true,
    prizeDetails: clean(prizeDetails), prize1, prize2, prize3, totalPrize,
    isPaid:       isPaid === 'true' || isPaid === true,
    entryFee, about: clean(about), registrationUrl,
    eligibility: clean(eligibility), rules: clean(rules), perks: clean(perks),
    pocName: clean(pocName), pocPhone, pocEmail, website,
    bannerImage, brochure,
  });

  // Award host points
  await PointsLog.create({ user: req.user._id, action: 'host', points: 300, description: `Submitted event: ${eventName}` });
  await User.findByIdAndUpdate(req.user._id, { $inc: { points: 300 } });

  return created(res, { hostedEvent: hosted, pointsEarned: 300 }, 'Event submitted for review');
});
