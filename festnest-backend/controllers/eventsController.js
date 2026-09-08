// controllers/eventsController.js
import mongoose     from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import Event        from '../models/Event.js';
import Competition  from '../models/Competition.js';
import { SavedEvent, Registration, Notification, PointsLog, HostedEvent } from '../models/index.js';
import { SavedEvent, Registration, Notification, PointsLog, HostedEvent, CampusAmbassador } from '../models/index.js';
import { calculateTier } from './caController.js';
import User         from '../models/User.js';
import { cloudinary, uploadEventBanner, uploadBrochure } from '../config/cloudinary.js';
import { sendRegistrationConfirmEmail } from '../utils/email.js';
import { ok, created, fail, notFoundRes, asyncHandler } from '../utils/response.js';

// Strip all HTML tags — returns plain text safe for DB storage
const STRIP_ALL = { allowedTags: [], allowedAttributes: {} };
const clean = str => (str ? sanitizeHtml(String(str), STRIP_ALL) : str);

const competitionFields = [
  'name', 'description', 'eligibility', 'registrationFee', 'prizeDetails',
  'venue', 'teamSize', 'format', 'duration', 'rules', 'registrationLink',
];

const cleanCompetition = (input = {}) => Object.fromEntries(
  competitionFields.map(field => [field, clean(String(input[field] || '').slice(0, field === 'rules' ? 1500 : field === 'description' ? 1000 : 500))])
);

const getOwnedEvent = async (slug, user) => {
  const lookup = mongoose.Types.ObjectId.isValid(slug)
    ? { $or: [{ slug }, { _id: slug }], isActive: true, isApproved: true }
    : { slug, isActive: true, isApproved: true };
  const event = await Event.findOne(lookup);
  if (!event) return { error: 'not_found' };
  const isOwner = event.hostedBy && event.hostedBy.toString() === user._id.toString();
  if (!isOwner) return { error: 'forbidden' };
  return { event };
};

export function parseEventStartDate(startDate) {
  const raw = String(startDate || '').trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    if (raw.includes('T')) {
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) return dt;
    }
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }

  const simpleRange = raw.match(/^(\d{1,2})\s*[\u2013\u2014-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (simpleRange) {
    const [, startDay, , monthText, year] = simpleRange;
    const monthIndex = new Date(monthText + ' 1, ' + year).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(Number(year), monthIndex, Number(startDay));
    }
  }

  const textMatch = raw.match(/^(\d{1,2})[\s-]+([A-Za-z]+)(?:,)?[\s-]+(\d{4})$/);
  if (textMatch) {
    const [, day, monthText, year] = textMatch;
    const monthIndex = new Date(monthText + ' 1, ' + year).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(Number(year), monthIndex, Number(day));
    }
  }

  const monthFirst = raw.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s+(\d{4})$/);
  if (monthFirst) {
    const [, monthText, day, year] = monthFirst;
    const monthIndex = new Date(monthText + ' 1, ' + year).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(Number(year), monthIndex, Number(day));
    }
  }

  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function parseEventEndDate(endDate, startDate) {
  const raw = String(endDate || startDate || '').trim();
  if (!raw) return null;

  // 1. ISO format with date (YYYY-MM-DD)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    if (raw.includes('T')) {
      const dt = new Date(raw);
      if (!isNaN(dt.getTime())) return dt;
    }
    const date = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
    return isNaN(date.getTime()) ? null : date;
  }

  // 2. Simple range with en-dash, em-dash, or hyphen (e.g. '18–19 May 2025' or '18 - 19 May 2025')
  const simpleRange = raw.match(/^(\d{1,2})\s*[\u2013\u2014-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (simpleRange) {
    const [, , endDay, monthText, year] = simpleRange;
    const monthIndex = new Date(monthText + ' 1, ' + year).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(Number(year), monthIndex, Number(endDay), 23, 59, 59, 999);
    }
  }

  // 3. Cross-month range (e.g. '30 May – 2 June 2025')
  const crossMonth = raw.match(/[\u2013\u2014-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (crossMonth) {
    const [, endDay, monthText, year] = crossMonth;
    const monthIndex = new Date(monthText + ' 1, ' + year).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(Number(year), monthIndex, Number(endDay), 23, 59, 59, 999);
    }
  }

  // 4. Single formatted date: '19 May 2025', '19 May, 2025', '19-May-2025'
  const textMatch = raw.match(/^(\d{1,2})[\s-]+([A-Za-z]+)(?:,)?[\s-]+(\d{4})$/);
  if (textMatch) {
    const [, day, monthText, year] = textMatch;
    const monthIndex = new Date(monthText + ' 1, ' + year).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(Number(year), monthIndex, Number(day), 23, 59, 59, 999);
    }
  }

  // 5. Month Day, Year: 'May 19, 2025' or 'May 19 2025'
  const monthFirst = raw.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s+(\d{4})$/);
  if (monthFirst) {
    const [, monthText, day, year] = monthFirst;
    const monthIndex = new Date(monthText + ' 1, ' + year).getMonth();
    if (!isNaN(monthIndex)) {
      return new Date(Number(year), monthIndex, Number(day), 23, 59, 59, 999);
    }
  }

  // 6. Generic Date fallback
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    d.setHours(23, 59, 59, 999);
    return d;
  }

  return null;
}

export function isEventExpired(ev, now = new Date()) {
  if (!ev) return false;
  const endDate = ev.endDate || ev.date?.end || '';
  const startDate = ev.startDate || ev.date?.start || (typeof ev.date === 'string' ? ev.date : '');
  const end = parseEventEndDate(endDate, startDate);
  if (!end) return false;
  return end.getTime() < now.getTime();
}

export function isEventFeatured(ev) {
  if (!ev) return false;
  return Boolean(ev.isFeatured || ev.featured || ev.badgeText === 'Featured' || ev.badge?.text === 'Featured');
}

export function getSortComparator(sortType) {
  switch (sortType) {
    case 'latest':
      return (a, b) => {
        const tA = new Date(a.date?.start || a.startDate || a.createdAt || 0).getTime() || 0;
        const tB = new Date(b.date?.start || b.startDate || b.createdAt || 0).getTime() || 0;
        return tB - tA;
      };
    case 'oldest':
      return (a, b) => {
        const tA = new Date(a.date?.start || a.startDate || a.createdAt || 0).getTime() || 0;
        const tB = new Date(b.date?.start || b.startDate || b.createdAt || 0).getTime() || 0;
        return tA - tB;
      };
    case 'mostregistered':
    case 'registered':
      return (a, b) => (b.stats?.registrationCount || b.registrationCount || 0) - (a.stats?.registrationCount || a.registrationCount || 0);
    case 'deadlinesoon':
    case 'deadline':
      return (a, b) => {
        const dA = a.date?.deadlineDays ?? a.deadlineDays ?? 999;
        const dB = b.date?.deadlineDays ?? b.deadlineDays ?? 999;
        return dA - dB;
      };
    case 'trending':
    default:
      return (a, b) => {
        const rA = a.trending?.rank ?? 999;
        const rB = b.trending?.rank ?? 999;
        if (rA !== rB) return rA - rB;
        const cA = new Date(a.createdAt || 0).getTime();
        const cB = new Date(b.createdAt || 0).getTime();
        return cB - cA;
      };
  }
}

export function sortEventsByStatus(events, comparator, now = new Date()) {
  if (!Array.isArray(events)) return [];
  const featuredActive = [];
  const nonFeaturedActive = [];
  const featuredExpired = [];
  const nonFeaturedExpired = [];

  for (const ev of events) {
    if (!ev) continue;
    const expired = isEventExpired(ev, now);
    const featured = isEventFeatured(ev);
    if (expired) {
      if (featured) featuredExpired.push(ev);
      else nonFeaturedExpired.push(ev);
    } else {
      if (featured) featuredActive.push(ev);
      else nonFeaturedActive.push(ev);
    }
  }

  if (comparator) {
    featuredActive.sort(comparator);
    nonFeaturedActive.sort(comparator);
    featuredExpired.sort(comparator);
    nonFeaturedExpired.sort(comparator);
  }

  return [...featuredActive, ...nonFeaturedActive, ...featuredExpired, ...nonFeaturedExpired];
}

// Recompute deadlineDays dynamically from date.start when it's parseable
function withDeadlineDays(ev, now = new Date()) {
  if (!ev) return ev;
  const startRaw = ev?.date?.start || ev?.startDate;
  if (!startRaw) return ev;
  const startDt = parseEventStartDate(startRaw);
  if (!startDt) return ev;
  const days = Math.max(0, Math.ceil((startDt.getTime() - now.getTime()) / 86400000));
  if (ev.date && typeof ev.date === 'object') {
    return { ...ev, date: { ...ev.date, deadlineDays: days } };
  }
  return { ...ev, deadlineDays: days };
}

const INDIA_TIME_ZONE = 'Asia/Kolkata';

function indiaDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dateKeyToUtc(key) {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function getEndingSoonDetails(endDate, startDate, now = new Date()) {
  // End date is optional in the host form. An omitted end date represents a
  // one-day event, so its start date is also its effective end date.
  const raw = String(endDate || startDate || '').trim();
  if (!raw) return null;
  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  const todayKey = indiaDateKey(now);
  const windowEnd = new Date(dateKeyToUtc(todayKey));
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 15);
  const windowEndKey = windowEnd.toISOString().slice(0, 10);

  // Date-only values represent an event that remains active through that local
  // calendar day. Timestamp values retain their precise end time.
  const endAt = dateOnly ? null : new Date(raw);
  if (!dateOnly && isNaN(endAt)) return null;
  if (endAt && endAt < now) return null;

  const endKey = dateOnly ? dateOnly[1] : indiaDateKey(endAt);
  if (endKey < todayKey || endKey > windowEndKey) return null;

  return {
    endAt: dateOnly ? dateKeyToUtc(endKey) : endAt.getTime(),
    daysUntilEnd: Math.round((dateKeyToUtc(endKey) - dateKeyToUtc(todayKey)) / 86400000),
  };
}

/* ────────────────────────────────────────────────────────
   GET /api/events
   Query: category, entryType, city, search, sort, page, limit
──────────────────────────────────────────────────────── */
export const listEvents = asyncHandler(async (req, res) => {
  const { category, entryType, city, search, sort = 'trending', page = 1, limit = 16 } = req.query;

  const filter = { isActive: true, isApproved: true };

  if (category && category !== 'all') {
    // Handle quick-filter aliases
    if (category === 'free')       filter.entryType = 'free';
    else if (category === 'prize') filter.entryType = 'prize';
    else if (category === 'week')  filter['date.deadlineDays'] = { $lte: 7, $gte: 0 };
    else filter.category = category;
  }

  if (entryType && entryType !== 'All') {
    if (entryType === 'Free' || entryType === 'free')             filter.entryType = 'free';
    else if (entryType === 'Paid' || entryType === 'paid')        filter.entryType = 'paid';
    else if (entryType === 'Prize Pool' || entryType === 'prize') filter.entryType = 'prize';
    else filter.entryType = entryType;
  }

  if (city && city !== 'All Cities' && city !== 'all') {
    // Case-insensitive exact match so SEO slugs ("chennai") match stored values
    // ("Chennai"). Hyphens in URL slugs are treated as spaces ("new-delhi" → "New Delhi").
    const term = String(city).trim().replace(/-/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.city = new RegExp(`^${term}$`, 'i');
  }

  if (search) {
    const s = String(search).trim();
    if (s) {
      const term = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: new RegExp(term, 'i') },
        { college: new RegExp(term, 'i') },
        { city: new RegExp(term, 'i') },
        { category: new RegExp(term, 'i') },
      ];
    }
  }

  const now = new Date();
  let allMatching = await Event.find(filter).lean();
  allMatching = allMatching.map(ev => withDeadlineDays(ev, now));

  const normalizedSort = String(sort).toLowerCase().replace(/\s+/g, '');
  const sortKeyMap = {
    trending: 'trending',
    latest: 'latest',
    oldest: 'oldest',
    mostregistered: 'registered',
    registered: 'registered',
    deadlinesoon: 'deadline',
    deadline: 'deadline',
  };
  const resolvedSort = sortKeyMap[normalizedSort] || 'trending';
  const sortComparator = getSortComparator(resolvedSort);

  // Priority order: Featured active → Active/upcoming non-featured → Expired at bottom
  const sortedEvents = sortEventsByStatus(allMatching, sortComparator, now);
  const total = sortedEvents.length;

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 16);
  const skip     = (pageNum - 1) * limitNum;

  const paginatedEvents = sortedEvents.slice(skip, skip + limitNum);
  const totalPages = Math.ceil(total / limitNum) || 1;

  return ok(res, {
    events: paginatedEvents,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: totalPages,
      hasPrev: pageNum > 1,
      hasNext: pageNum < totalPages,
    },
  });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/trending
──────────────────────────────────────────────────────── */
export const trendingEvents = asyncHandler(async (_req, res) => {
  const now = new Date();
  const events = await Event.find({ isActive: true, 'trending.rank': { $ne: null } }).lean();
  const formatted = events.map(ev => withDeadlineDays(ev, now));
  const sorted = sortEventsByStatus(formatted, getSortComparator('trending'), now);
  return ok(res, { events: sorted.slice(0, 5) });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/featured
──────────────────────────────────────────────────────── */
export const featuredEvents = asyncHandler(async (_req, res) => {
  const now = new Date();
  const events = await Event.find({ isActive: true, isApproved: true, isFeatured: true }).lean();
  const formatted = events.map(ev => withDeadlineDays(ev, now));
  const comparator = (a, b) => (a.featuredOrder || 0) - (b.featuredOrder || 0);
  const sorted = sortEventsByStatus(formatted, comparator, now);
  return ok(res, { events: sorted.slice(0, 6) });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/urgent
──────────────────────────────────────────────────────── */
export const urgentEvents = asyncHandler(async (_req, res) => {
  const now = new Date();
  const events = await Event.find({ isActive: true, isApproved: true }).lean();
  const endingSoon = events
    .map(event => ({ event, details: getEndingSoonDetails(event.date?.end, event.date?.start, now) }))
    .filter(({ details }) => details)
    .sort((a, b) => a.details.endAt - b.details.endAt)
    .map(({ event, details }) => ({
      ...event,
      endingSoonDays: details.daysUntilEnd,
    }));

  return ok(res, { events: endingSoon });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/saved   (auth required)
──────────────────────────────────────────────────────── */
export const savedEvents = asyncHandler(async (req, res) => {
  const now = new Date();
  const saved = await SavedEvent.find({ user: req.user._id })
    .populate('event').sort({ createdAt: -1 }).lean();
  const rawEvents = saved.map(s => s.event).filter(Boolean).map(ev => withDeadlineDays(ev, now));
  const sorted = sortEventsByStatus(rawEvents, getSortComparator('latest'), now);
  return ok(res, { events: sorted });
});

/* ────────────────────────────────────────────────────────
   GET /api/events/:slug
   Admins can view any event regardless of isActive status.
──────────────────────────────────────────────────────── */
export const getEvent = asyncHandler(async (req, res) => {
  const isAdminPreview = req.user?.role === 'admin' || req.user?.role === 'superadmin';

  // Admins can view inactive events; regular users only see active ones
  const slugFilter = { slug: req.params.slug };
  if (!isAdminPreview) Object.assign(slugFilter, { isActive: true, isApproved: true });

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
    if (!isAdminPreview) Object.assign(idFilter, { isActive: true, isApproved: true });
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

  const now = new Date();
  const related = await Event.find({
    category: event.category,
    _id: { $ne: event._id },
    isActive: true,
    isApproved: true,
  }).lean();

  const formattedRelated = related.map(ev => withDeadlineDays(ev, now));
  const sortedRelated = sortEventsByStatus(formattedRelated, getSortComparator('trending'), now).slice(0, 4);

  let isSaved = false;
  if (req.user) {
    isSaved = !!(await SavedEvent.findOne({ user: req.user._id, event: event._id }));
  }

  const competitions = await Competition.find({ event: event._id }).sort({ createdAt: 1 }).lean();
  return ok(res, { event: { ...withDeadlineDays(event, now), competitions }, related: sortedRelated, isSaved });
});

/*
   PATCH /api/events/:slug

   The route accepts the host-form fields only. It deliberately does not pass
   req.body to Mongoose so an owner cannot alter identity, approval, analytics,
   or an event's separately managed competitions.
*/
export const updateOwnedEvent = asyncHandler(async (req, res) => {
  const result = await getOwnedEvent(req.params.slug, req.user);
  if (result.error === 'not_found') return notFoundRes(res, 'Event not found');
  if (result.error === 'forbidden') return fail(res, 'You are not allowed to edit this event', 403);

  const event = result.event;
  const {
    eventName, college, eventType, startDate, endDate = '', city, venue = '',
    teamSize = '', mode = 'Offline', hasPrize = false, prize1 = '', prize2 = '',
    prize3 = '', totalPrize = '', isPaid = false, entryFee = '', about = '',
    registrationUrl = '', eligibility = '', rules = '', perks = '', pocName = '',
    pocPhone = '', pocEmail = '', website = '',
  } = req.body;

  const paid = isPaid === 'true' || isPaid === true;
  const prize = hasPrize === 'true' || hasPrize === true;
  const fee = clean(entryFee);
  const prizeDetails = prize && totalPrize ? `₹${clean(totalPrize)} Prize Pool` : '';

  const update = {
    name: clean(eventName),
    category: clean(eventType),
    college: clean(college),
    city: clean(city),
    organiser: { ...event.organiser.toObject(), location: clean(city), sub: clean(college) },
    date: { ...event.date.toObject(), start: startDate, end: endDate },
    venue: clean(venue),
    teamSize: clean(req.body.teamSize ?? event.teamSize),
    mode: clean(mode),
    about: clean(about),
    registrationUrl: clean(registrationUrl),
    eligibility: clean(eligibility),
    rules: clean(rules),
    perks: clean(perks),
    pocName: clean(pocName),
    pocPhone: clean(pocPhone),
    pocEmail: clean(pocEmail),
    website: clean(website),
    prize1: clean(req.body.prize1 ?? event.prize1),
    prize2: clean(req.body.prize2 ?? event.prize2),
    prize3: clean(req.body.prize3 ?? event.prize3),
    totalPrize: prize ? clean(totalPrize) : '',
    entryType: paid ? 'paid' : prize ? 'prize' : 'free',
    price: {
      ...event.price.toObject(),
      display: paid ? `₹${fee}` : 'Free',
      note: paid ? 'per team' : 'to register',
    },
    badge: {
      ...event.badge.toObject(),
      text: prize ? `🏆 ${prizeDetails}` : paid ? `₹${fee} Entry` : 'Free Entry',
      class: prize ? 'badge-prize' : paid ? 'badge-paid' : 'badge-free',
    },
  };

  const files = req.files || {};
  const bannerFile = files.bannerImage?.[0];
  const brochureFile = files.brochure?.[0];
  if (bannerFile && bannerFile.size > 5 * 1024 * 1024)
    return fail(res, 'Poster image must be 5 MB or smaller', 400);

  // Upload first; the existing asset remains in place unless the replacement
  // upload succeeds and the event document is saved successfully.
  const [bannerResult, brochureResult] = await Promise.all([
    bannerFile ? uploadEventBanner(bannerFile.buffer) : null,
    brochureFile ? uploadBrochure(brochureFile.buffer) : null,
  ]);
  if (bannerResult) update.image = { url: bannerResult.secure_url, publicId: bannerResult.public_id };
  if (brochureResult) update.brochure = { url: brochureResult.secure_url, publicId: brochureResult.public_id };

  const oldBannerId = event.image?.publicId;
  const oldBrochureId = event.brochure?.publicId;
  event.set(update);
  await event.save();

  // Cleanup is intentionally best-effort and only runs after the new values
  // are persisted. A cleanup failure never rolls back a successful edit.
  const cleanup = [];
  if (bannerResult && oldBannerId && oldBannerId !== bannerResult.public_id)
    cleanup.push(cloudinary.uploader.destroy(oldBannerId));
  if (brochureResult && oldBrochureId && oldBrochureId !== brochureResult.public_id)
    cleanup.push(cloudinary.uploader.destroy(oldBrochureId, { resource_type: 'raw' }));
  if (cleanup.length) Promise.allSettled(cleanup).catch(() => {});

  return ok(res, { event: withDeadlineDays(event.toObject()) }, 'Event updated successfully');
});

/* ────────────────────────────────────────────────────────
   Competition management
   Public reads are returned with the parent event above. Mutations require
   the live event owner and never create a top-level Event.
──────────────────────────────────────────────────────── */
export const addCompetition = asyncHandler(async (req, res) => {
  const result = await getOwnedEvent(req.params.slug, req.user);
  if (result.error === 'not_found') return notFoundRes(res, 'Event not found');
  if (result.error === 'forbidden') return fail(res, 'You are not allowed to manage this event', 403);
  const fields = cleanCompetition(req.body);
  if (!fields.name.trim()) return fail(res, 'Competition name is required', 400);
  const competition = await Competition.create({ event: result.event._id, ...fields });
  return created(res, { competition }, 'Competition added');
});

export const updateCompetition = asyncHandler(async (req, res) => {
  const result = await getOwnedEvent(req.params.slug, req.user);
  if (result.error === 'not_found') return notFoundRes(res, 'Event not found');
  if (result.error === 'forbidden') return fail(res, 'You are not allowed to manage this event', 403);
  const fields = cleanCompetition(req.body);
  if (!fields.name.trim()) return fail(res, 'Competition name is required', 400);
  const competition = await Competition.findOneAndUpdate(
    { _id: req.params.competitionId, event: result.event._id },
    fields,
    { new: true, runValidators: true }
  );
  if (!competition) return notFoundRes(res, 'Competition not found');
  return ok(res, { competition }, 'Competition updated');
});

export const deleteCompetition = asyncHandler(async (req, res) => {
  const result = await getOwnedEvent(req.params.slug, req.user);
  if (result.error === 'not_found') return notFoundRes(res, 'Event not found');
  if (result.error === 'forbidden') return fail(res, 'You are not allowed to manage this event', 403);
  const deleted = await Competition.findOneAndDelete({ _id: req.params.competitionId, event: result.event._id });
  if (!deleted) return notFoundRes(res, 'Competition not found');
  return ok(res, {}, 'Competition deleted');
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

  // Campus Ambassador referral attribution hook
  const referredByCode = (req.body.referredByCode || '').trim().toUpperCase();
  if (referredByCode) {
    try {
      const ca = await CampusAmbassador.findOne({ referralCode: referredByCode });
      if (ca && ca.status === 'approved') {
        const organizerIdStr = String(req.user._id);
        const alreadyCounted = (ca.referredOrganizerIds || []).some(id => String(id) === organizerIdStr);
        if (!alreadyCounted) {
          ca.referredOrganizerIds = ca.referredOrganizerIds || [];
          ca.referredOrganizerIds.push(req.user._id);
          ca.stats = ca.stats || { organizersOnboarded: 0, eventsSourced: 0 };
          ca.stats.organizersOnboarded = (ca.stats.organizersOnboarded || 0) + 1;
          ca.tier = calculateTier(ca.stats.organizersOnboarded);
          await ca.save();
        }
      }
    } catch (caErr) {
      console.error('[CA Referral Attribution Error]', caErr.message);
      // must never affect event creation response
    }
  }

  return created(res, { hostedEvent: hosted, pointsEarned: 300 }, 'Event submitted for review');
});

/* ────────────────────────────────────────────────────────
   GET /api/events/stats
   Public. Returns real counts for use on landing page.
──────────────────────────────────────────────────────── */
export const getEventStats = asyncHandler(async (req, res) => {
  const [totalEvents, colleges] = await Promise.all([
    Event.countDocuments({ isActive: true, isApproved: true }),
    Event.distinct('college', { isActive: true, isApproved: true }),
  ]);
  return ok(res, { totalEvents, totalColleges: colleges.length, totalCategories: 7 });
});
