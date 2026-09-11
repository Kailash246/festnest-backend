// controllers/caController.js
import CampusAmbassador from '../models/CampusAmbassador.js';
import CAReferralLog from '../models/CAReferralLog.js';
import User from '../models/User.js';
import { HostedEvent } from '../models/index.js';
import Event from '../models/Event.js';
import { ok, created, fail, notFoundRes, asyncHandler } from '../utils/response.js';
import { uploadAmbassadorPhoto } from '../config/cloudinary.js';
import { sendAmbassadorApprovedEmail } from '../utils/email.js';

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
  bhopal:        'BHO',
  indore:        'IDR',
  patna:         'PAT',
  nagpur:        'NAG',
  surat:         'SUR',
  vadodara:      'BDQ',
  visakhapatnam: 'VTZ',
  thiruvananthapuram: 'TRV',
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
 * Single centralized tier threshold helper:
 * 0-2: Bronze
 * 3-7: Silver
 * 8-15: Gold
 * 16+: City Lead
 */
export function calculateTier(organizersCount) {
  const count = Number(organizersCount) || 0;
  if (count >= 15) return 'City Lead';
  if (count >= 16) return 'City Lead';
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
   Public application submission with optional photo upload
──────────────────────────────────────────────────────── */
export const apply = asyncHandler(async (req, res) => {
  const {
    name, email, phone, city, college, course, year = '',
    instagram = '', why, referral = '', referralCodeUsed = '',
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
  // Check for duplicate active applications
  const duplicateQuery = {
    status: { $in: ['applied', 'screening', 'approved'] },
    status: { $in: ['applied', 'approved'] },
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

  // Handle optional photo upload via Cloudinary
  let photoUrl = null;
  if (req.file) {
    try {
      const uploadRes = await uploadAmbassadorPhoto(req.file.buffer);
      photoUrl = uploadRes.secure_url;
    } catch (err) {
      console.error('[Cloudinary Photo Upload Error]', err.message);
    }
  } else if (req.body.photoUrl) {
    photoUrl = req.body.photoUrl;
  }

  // Link userId if logged in or if a user exists with this email
  let userId = req.user?._id || null;
  if (!userId) {
    const matchingUser = await User.findOne({ email: cleanEmail }).select('_id').lean();
    if (matchingUser) userId = matchingUser._id;
  }

  const codeUsed = (referralCodeUsed || referral || '').trim().toUpperCase();

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
    referralCodeUsed: codeUsed,
    referredByCode: codeUsed,
    photoUrl,
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
    stats: {
      organizersOnboarded: 0,
      eventsSourced: 0,
    },
    appliedAt: new Date(),
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
   GET /api/ca/applications (Admin-protected)
   List applications with status filter, search, & counts
 ──────────────────────────────────────────────────────── */
export const listApplications = asyncHandler(async (req, res) => {
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
    limit = 50,
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
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
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
      CampusAmbassador.countDocuments({ status: 'applied' }),
      CampusAmbassador.countDocuments({ status: 'approved' }),
      CampusAmbassador.countDocuments({ status: 'rejected' }),
    ]).then(([all, applied, approved, rejected]) => ({
      all,
      applied,
      pending: applied,
      approved,
      rejected,
    })),
  ]);

  return ok(res, {
    ambassadors,
    applications: ambassadors,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
    counts,
  });
});

/* ────────────────────────────────────────────────────────
   POST /api/ca/:id/approve (Admin-protected)
   Generates caId + referralCode, sets status/approvedAt, sends email
──────────────────────────────────────────────────────── */
export const approveApplication = asyncHandler(async (req, res) => {
  const ca = await CampusAmbassador.findById(req.params.id);
  if (!ca) return notFoundRes(res, 'Ambassador application not found');

  if (ca.status === 'approved') {
    return fail(res, 'This applicant has already been approved');
  }

  const cityCode = ca.cityCode || getCityCode(ca.city);
  ca.cityCode = cityCode;

  // Generate sequential caId and referralCode: FN-CA-{CITYCODE}-{seq}
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
  const year = now.getFullYear() + 2; // 2 years validity
  const validThru = `${month} / ${year}`;

  ca.caId = caId;
  ca.referralCode = referralCode;
  ca.validThru = validThru;
  ca.status = 'approved';
  ca.approvedAt = now;
  ca.rejectedAt = null;
  ca.rejectionReason = '';

  // Calculate tier based on current organizers onboarded
  ca.tier = calculateTier(ca.stats?.organizersOnboarded || 0);

  // Link user if matching account exists
  if (!ca.userId) {
    const user = await User.findOne({ email: ca.email }).select('_id').lean();
    if (user) ca.userId = user._id;
  }

  await ca.save();

  // Send approval email via Resend helper (non-blocking)
  sendAmbassadorApprovedEmail({
    email: ca.email,
    name: ca.name,
    caId,
    referralCode,
  }).catch(err => {
    console.error('[CA Approval Email Error]', err.message);
  });

  return ok(
    res,
    {
      ambassador: ca,
      caId,
      referralCode,
    },
    `Approved ${ca.name}! Official ID: ${caId}`
  );
});

/* ────────────────────────────────────────────────────────
   POST /api/ca/:id/reject (Admin-protected)
   Sets status/rejectedAt
──────────────────────────────────────────────────────── */
export const rejectApplication = asyncHandler(async (req, res) => {
  const { reason = 'Application does not meet current criteria' } = req.body;
  const ca = await CampusAmbassador.findById(req.params.id);
  if (!ca) return notFoundRes(res, 'Ambassador application not found');

  if (ca.status === 'rejected') {
    return fail(res, 'This applicant has already been rejected');
  }

  const now = new Date();
  ca.status = 'rejected';
  ca.rejectedAt = now;
  ca.rejectionReason = reason;

  await ca.save();
  return ok(res, { ambassador: ca }, 'Application rejected');
});

/* ────────────────────────────────────────────────────────
   GET /api/ca/me (Auth-protected)
   Look up by userId, else by email match (auto-link userId), else 404
──────────────────────────────────────────────────────── */
export const getMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userEmail = req.user.email?.toLowerCase();

  // 1. Look up by userId
  let ca = await CampusAmbassador.findOne({ userId }).sort({ createdAt: -1 });

  // 2. Fall back to email match and auto-link userId on first match
  if (!ca && userEmail) {
    ca = await CampusAmbassador.findOne({ email: userEmail }).sort({ createdAt: -1 });
    if (ca && !ca.userId) {
      ca.userId = userId;
      await ca.save();
    }
  }

  // 3. Else 404
  if (!ca) {
    return notFoundRes(res, 'No campus ambassador record found for your account');
  }

  // Ensure tier matches live stats
  const calculatedTier = calculateTier(ca.stats?.organizersOnboarded || 0);
  if (ca.tier !== calculatedTier) {
    ca.tier = calculatedTier;
    await ca.save();
  }

  // Pending / screening / rejected states: return safe tracking info
  const rawClientUrl = process.env.PUBLIC_SITE_URL || (process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0].trim() : 'https://festnest.in');
  const clientUrl = (rawClientUrl.includes('vercel.app') || rawClientUrl.includes('onrender.com')) ? 'https://festnest.in' : rawClientUrl;
  const referralUrl = ca.referralCode ? `${clientUrl}?ref=${ca.referralCode}` : '';

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
      createdAt: ca.createdAt,
      tier: ca.tier,
      photoUrl: ca.photoUrl,
      validThru: ca.validThru,
      appliedAt: ca.appliedAt,
      approvedAt: ca.approvedAt,
      stats: ca.stats || { organizersOnboarded: 0, eventsSourced: 0, referralSignups: 0 },
      rejectionReason: ca.status === 'rejected' ? ca.rejectionReason : undefined,
    },
  });
});

/* ────────────────────────────────────────────────────────
   GET /api/ca/card/:caId
   Public verification endpoint (safe fields only)
   GET /api/ca/card/:caId (Public verification endpoint)
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
      photoUrl: ca.photoUrl,
    },
  });
});

/* ────────────────────────────────────────────────────────
   GET /api/ca/me/impact (Auth-protected)
   Returns paginated CAReferralLog entries for the logged-in CA
──────────────────────────────────────────────────────── */
export const getMyImpact = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const userEmail = req.user.email?.toLowerCase();

  let ca = await CampusAmbassador.findOne({ userId }).sort({ createdAt: -1 });
  if (!ca && userEmail) {
    ca = await CampusAmbassador.findOne({ email: userEmail }).sort({ createdAt: -1 });
  }

  if (!ca) {
    return notFoundRes(res, 'No campus ambassador record found for your account');
  }

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

/* ────────────────────────────────────────────────────────
   GET /api/ca/:id/impact (Admin-protected)
   Returns paginated CAReferralLog entries for a specific CA
──────────────────────────────────────────────────────── */
export const getCAImpact = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ca = await CampusAmbassador.findById(id);
  if (!ca) {
    return notFoundRes(res, 'Ambassador not found');
  }

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

