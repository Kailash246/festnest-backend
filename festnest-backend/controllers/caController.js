// controllers/caController.js
import CampusAmbassador from '../models/CampusAmbassador.js';
import User from '../models/User.js';
import { HostedEvent } from '../models/index.js';
import Event from '../models/Event.js';
import { ok, created, fail, notFoundRes, asyncHandler } from '../utils/response.js';

/* ── Standard Launch City Mapping ── */
const CITY_CODES = {
  bangalore:     'BLR',
  bengaluru:     'BLR',
  pune:          'PUN',
  chennai:       'CHE',
  delhi:         'DEL',
  'new delhi':   'DEL',
  noida:         'DEL',
  gurgaon:       'DEL',
  gurugram:      'DEL',
  mumbai:        'MUM',
  'navi mumbai': 'MUM',
  hyderabad:     'HYD',
  kolkata:       'KOL',
  ahmedabad:     'AHM',
  jaipur:        'JAI',
  chandigarh:    'IXC',
  kochi:         'COK',
  coimbatore:    'CJB',
  lucknow:       'LKO',
};

export function getCityCode(cityName) {
  const norm = (cityName || '').trim().toLowerCase();
  if (CITY_CODES[norm]) return CITY_CODES[norm];
  for (const [key, code] of Object.entries(CITY_CODES)) {
    if (norm.includes(key)) return code;
  }
  const clean = norm.replace(/[^a-z]/g, '').toUpperCase();
  return clean.slice(0, 3) || 'IND';
}

/**
 * Tier logic based on organizers onboarded:
 * Bronze: 0–2
 * Silver: 3–7
 * Gold: 8–14
 * City Lead: 15+
 */
export function calculateTier(organizersCount) {
  const count = Number(organizersCount) || 0;
  if (count >= 15) return 'City Lead';
  if (count >= 8)  return 'Gold';
  if (count >= 3)  return 'Silver';
  return 'Bronze';
}

/**
 * Compute real platform impact metrics for a Campus Ambassador
 */
export async function computeImpactStats(ca) {
  if (!ca || !ca._id) {
    return { organizersOnboarded: 0, eventsSourced: 0, referralSignups: 0, tier: 'Bronze' };
  }

  // 1. Direct student/user referral signups
  const rawSignups = await User.countDocuments({ referredByCA: ca._id });
  const referralSignups = rawSignups + (ca.adjustments?.referralSignups || 0);

  // 2. Organizers Onboarded
  // Users who signed up via CA referral and have role 'organizer' or submitted an event
  const referredUsers = await User.find({ referredByCA: ca._id }, '_id role').lean();
  const referredUserIds = referredUsers.map(u => u._id);

  const organizerUserIds = new Set(
    referredUsers.filter(u => u.role === 'organizer').map(u => String(u._id))
  );

  let approvedEventsCount = 0;
  if (referredUserIds.length > 0) {
    // Find hosted submissions by referred users that were approved
    const hostedSubmissions = await HostedEvent.find(
      { submittedBy: { $in: referredUserIds } },
      'submittedBy status linkedEvent'
    ).lean();

    hostedSubmissions.forEach(sub => {
      organizerUserIds.add(String(sub.submittedBy));
      if (sub.status === 'approved' || sub.linkedEvent) {
        approvedEventsCount++;
      }
    });

    // Also check live events where organizer is a referred user
    const liveEventsCount = await Event.countDocuments({
      organizerId: { $in: referredUserIds },
      isDeleted: { $ne: true },
    });
    // Use the max of approved submissions or live events to avoid double counting
    approvedEventsCount = Math.max(approvedEventsCount, liveEventsCount);
  }

  const organizersOnboarded = organizerUserIds.size + (ca.adjustments?.organizersOnboarded || 0);
  const eventsSourced = approvedEventsCount + (ca.adjustments?.eventsSourced || 0);
  const tier = calculateTier(organizersOnboarded);

  return {
    organizersOnboarded,
    eventsSourced,
    referralSignups,
    tier,
  };
}

/* ────────────────────────────────────────────────────────
   POST /api/ca/apply
   Public application submission
──────────────────────────────────────────────────────── */
export const apply = asyncHandler(async (req, res) => {
  const {
    name, email, phone, city, college, course, year = '',
    instagram = '', why, referral = '',
  } = req.body;

  // Basic validation
  if (!name || !name.trim()) return fail(res, 'Full name is required');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'A valid email is required');
  if (!phone || !phone.trim() || phone.replace(/\D/g, '').length < 10)
    return fail(res, 'A valid 10-digit phone number is required');
  if (!city || !city.trim()) return fail(res, 'City is required');
  if (!college || !college.trim()) return fail(res, 'College name is required');
  if (!course || !course.trim()) return fail(res, 'Course & year are required');
  if (!why || why.trim().length < 20)
    return fail(res, 'Please share at least a couple sentences on why you want to become a CA (min 20 characters)');

  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim().replace(/\s+/g, '');
  const cityCode   = getCityCode(city);

  // Multi-vector duplicate application check across active states
  const duplicateQuery = {
    status: { $in: ['applied', 'screening', 'approved'] },
    $or: [
      { email: cleanEmail },
      { phone: cleanPhone },
      ...(req.user?._id ? [{ userId: req.user._id }] : []),
    ],
  };

  const existing = await CampusAmbassador.findOne(duplicateQuery).lean();
  if (existing) {
    if (existing.status === 'approved') {
      return fail(
        res,
        'You are already an approved FestNest Campus Ambassador! Access your dashboard at /ca/dashboard.',
        409
      );
    }
    return fail(
      res,
      'You already have an active application under review. Our team will contact you within 5–7 business days.',
      409
    );
  }

  // Link userId if logged in or if a user exists with this email
  let userId = req.user?._id || null;
  if (!userId) {
    const matchingUser = await User.findOne({ email: cleanEmail }).select('_id').lean();
    if (matchingUser) userId = matchingUser._id;
  }

  const ca = await CampusAmbassador.create({
    userId,
    name: name.trim(),
    email: cleanEmail,
    phone: cleanPhone,
    city: city.trim(),
    cityCode,
    college: college.trim(),
    course: course.trim(),
    year: year.trim(),
    instagram: instagram.trim(),
    why: why.trim(),
    referredByCode: referral.trim().toUpperCase(),
    status: 'applied',
    tier: 'Bronze',
    auditLog: [
      {
        action: 'applied',
        by: userId,
        byName: name.trim(),
        date: new Date(),
        notes: 'Application submitted via web form',
      },
    ],
  });

  return created(
    res,
    {
      id: ca._id,
      name: ca.name,
      status: ca.status,
    },
    "Application received! We'll review your application and email you within 5–7 days."
  );
});

/* ────────────────────────────────────────────────────────
   GET /api/ca/me
   Authenticated ambassador dashboard info & live metrics
──────────────────────────────────────────────────────── */
export const getMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userEmail = req.user.email.toLowerCase();

  const ca = await CampusAmbassador.findOne({
    $or: [{ userId }, { email: userEmail }],
  }).sort({ createdAt: -1 });

  if (!ca) {
    return ok(res, { profile: null, status: 'unapplied' }, 'No ambassador profile found');
  }

  // If approved, calculate live derived platform stats and current tier
  if (ca.status === 'approved') {
    const stats = await computeImpactStats(ca);

    // Auto-update tier if it progressed and wasn't manually altered
    if (stats.tier !== ca.tier) {
      ca.tier = stats.tier;
      await ca.save();
    }

    // Generate referral link base
    const clientUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0].trim() : 'https://festnest.in';
    const referralUrl = `${clientUrl}?ref=${ca.referralCode}`;

    return ok(res, {
      profile: {
        _id: ca._id,
        name: ca.name,
        email: ca.email,
        phone: ca.phone,
        college: ca.college,
        city: ca.city,
        course: ca.course,
        caId: ca.caId,
        referralCode: ca.referralCode,
        referralUrl,
        status: ca.status,
        tier: ca.tier,
        validThru: ca.validThru,
        approvedAt: ca.approvedAt,
        stats,
      },
    });
  }

  // Pending / screening / rejected states: return safe tracking info
  return ok(res, {
    profile: {
      _id: ca._id,
      name: ca.name,
      email: ca.email,
      college: ca.college,
      city: ca.city,
      course: ca.course,
      status: ca.status,
      createdAt: ca.createdAt,
      rejectionReason: ca.status === 'rejected' ? ca.rejectionReason : undefined,
    },
  });
});

/* ────────────────────────────────────────────────────────
   GET /api/ca/card/:caId
   Public verification endpoint (safe fields only)
──────────────────────────────────────────────────────── */
export const getPublicCard = asyncHandler(async (req, res) => {
  const rawId = req.params.caId.trim();
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(rawId);

  const query = isObjectId
    ? { $or: [{ _id: rawId }, { caId: rawId.toUpperCase() }] }
    : { caId: rawId.toUpperCase() };

  const ca = await CampusAmbassador.findOne(query).lean();

  if (!ca || ca.status !== 'approved') {
    return notFoundRes(res, 'Ambassador credential not found or not currently active');
  }

  // STRICTLY public-safe fields: never expose phone, email, why, internal notes
  return ok(res, {
    card: {
      caId: ca.caId,
      name: ca.name,
      college: ca.college,
      city: ca.city,
      tier: ca.tier,
      validThru: ca.validThru,
      approvedAt: ca.approvedAt,
      status: ca.status,
    },
  });
});

