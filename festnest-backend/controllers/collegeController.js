// controllers/collegeController.js
import { College } from '../models/index.js';
import Event  from '../models/Event.js';
import User   from '../models/User.js';
import { ok, fail, asyncHandler } from '../utils/response.js';

export const listColleges = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const filter = q ? { $text: { $search: q } } : {};
  const colleges = await College.find(filter).sort({ name: 1 }).limit(30).lean();
  return ok(res, { colleges });
});

export const myCollege = asyncHandler(async (req, res) => {
  const collegeName = req.query.college || req.user?.college;
  if (!collegeName) return fail(res, 'college param or auth required', 400);
  const [college, events, studentCount] = await Promise.all([
    College.findOne({ name: collegeName }).lean(),
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

/**
 * GET /api/college/hosting-institutions
 * Public endpoint for the landing page trust section.
 * Returns verified institutions that have hosted at least one published event on FestNest,
 * have accepted the modern brand-use Terms (or are marked eligible), and whose marketing
 * display is active (not revoked/disabled by takedown requests).
 */
export const getHostingInstitutions = asyncHandler(async (_req, res) => {
  // Query colleges where marketing display is permitted and either explicitly eligible
  // or with published events under Terms 2026-09
  const colleges = await College.find({
    isMarketingDisplayAllowed: { $ne: false },
    $or: [
      { marketingEligible: true },
      { termsVersionAccepted: '2026-09' },
      { hasPublishedEvent: true, termsVersionAccepted: { $ne: null } },
    ],
  }).lean();

  const eligibleInstitutions = [];

  for (const col of colleges) {
    const eventCount = await Event.countDocuments({
      college: col.name,
      isActive: true,
      isApproved: true,
    });

    // Only display institutions that have at least one live, approved event
    if (eventCount > 0) {
      eligibleInstitutions.push({
        id: col._id,
        name: col.name,
        city: col.city,
        state: col.state,
        logoUrl: col.logoUrl || '',
        logoEmoji: col.logoEmoji || '🏛️',
        eventCount,
      });
    }
  }

  // Sort by eventCount descending, then alphabetical
  eligibleInstitutions.sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name));

  return ok(res, { institutions: eligibleInstitutions });
});
