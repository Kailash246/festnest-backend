// services/caPerformanceService.js
// Canonical calculation engine and single source of truth for Campus Ambassador performance, points, milestones & rewards
import mongoose from 'mongoose';
import CampusAmbassador from '../models/CampusAmbassador.js';
import CAReferralLog from '../models/CAReferralLog.js';
import CAPointLedger from '../models/CAPointLedger.js';
import CARewardSnapshot from '../models/CARewardSnapshot.js';
import User from '../models/User.js';
import { HostedEvent } from '../models/index.js';
import Event from '../models/Event.js';
import { CA_PROGRAM_CONFIG } from '../config/caProgramConfig.js';

/**
 * Single source of truth calculation helper for a Campus Ambassador
 */
export async function calculateCAPerformance(caInput) {
  let ca = caInput;
  if (!ca || !ca._id) {
    return null;
  }

  // Reload fresh if passed a plain ID or lean object without full fields
  if (typeof ca === 'string' || mongoose.Types.ObjectId.isValid(ca) && !(ca instanceof mongoose.Document)) {
    ca = await CampusAmbassador.findById(ca).lean();
    if (!ca) return null;
  }

  const caId = ca._id;

  // 1. Calculate points directly from auditable ledger
  const ledgerAggregate = await CAPointLedger.aggregate([
    { $match: { caId: new mongoose.Types.ObjectId(caId) } },
    {
      $group: {
        _id: '$type',
        totalPoints: { $sum: '$points' },
        count: { $sum: 1 },
      },
    },
  ]);

  let userSignupPoints = 0;
  let organizerPoints = 0;
  let adjustmentPoints = 0;
  let totalLedgerPoints = 0;

  for (const group of ledgerAggregate) {
    totalLedgerPoints += group.totalPoints;
    if (group._id === 'USER_VERIFIED') {
      userSignupPoints += group.totalPoints;
    } else if (
      group._id === 'ORGANIZER_VERIFIED' ||
      group._id === 'ORGANIZER_FIRST_EVENT_APPROVED'
    ) {
      organizerPoints += group.totalPoints;
    } else if (
      group._id === 'POINT_ADJUSTMENT' ||
      group._id === 'POINT_REVERSAL'
    ) {
      adjustmentPoints += group.totalPoints;
    }
  }

  // Include admin metric adjustment points if present
  const manualAdjustmentPoints = ca.adjustments?.points || 0;
  const verifiedPoints = Math.max(0, totalLedgerPoints + manualAdjustmentPoints);

  // 2. Compute verified users (students) count
  const verifiedUsersCount = (ca.stats?.referralSignups || 0) + (ca.adjustments?.referralSignups || 0);

  // 3. Compute verified organizers count
  const verifiedOrganizersCount = (ca.stats?.organizersOnboarded || 0) + (ca.adjustments?.organizersOnboarded || 0);

  // 4. Compute approved events count
  const approvedEventsCount = (ca.stats?.eventsSourced || 0) + (ca.adjustments?.eventsSourced || 0);

  // 5. Milestone & Eligibility Evaluation
  const certificateEligible = verifiedPoints >= CA_PROGRAM_CONFIG.milestones.certificate.pointsRequired;
  const certificateUnlockedAt = ca.certificateUnlockedAt || (certificateEligible ? (ca.approvedAt || new Date()) : null);

  const reqs = CA_PROGRAM_CONFIG.rewardEligibility;
  const hasMinPoints = verifiedPoints >= reqs.minPoints;
  const hasMinUsers = verifiedUsersCount >= reqs.minVerifiedUsers;
  const hasMinEvents = approvedEventsCount >= reqs.minApprovedEvents;
  const hasMinOrganizers = verifiedOrganizersCount >= reqs.minVerifiedOrganizers;

  const rewardEligible = hasMinPoints && hasMinUsers && hasMinEvents && hasMinOrganizers;
  const rewardEligibleAt = ca.rewardEligibleAt || (rewardEligible ? new Date() : null);

  // 6. Calculate Rank (among all approved CAs with deterministic tie-breaking)
  const betterCAsCount = await CampusAmbassador.countDocuments({
    status: 'approved',
    _id: { $ne: caId },
    $or: [
      { totalPoints: { $gt: verifiedPoints } },
      {
        totalPoints: verifiedPoints,
        'stats.eventsSourced': { $gt: approvedEventsCount },
      },
      {
        totalPoints: verifiedPoints,
        'stats.eventsSourced': approvedEventsCount,
        'stats.organizersOnboarded': { $gt: verifiedOrganizersCount },
      },
      {
        totalPoints: verifiedPoints,
        'stats.eventsSourced': approvedEventsCount,
        'stats.organizersOnboarded': verifiedOrganizersCount,
        'stats.referralSignups': { $gt: verifiedUsersCount },
      },
      {
        totalPoints: verifiedPoints,
        'stats.eventsSourced': approvedEventsCount,
        'stats.organizersOnboarded': verifiedOrganizersCount,
        'stats.referralSignups': verifiedUsersCount,
        createdAt: { $lt: ca.createdAt },
      },
    ],
  });

  const rank = betterCAsCount + 1;

  // 7. Determine Performance Status
  let performanceStatus = CA_PROGRAM_CONFIG.statuses.GETTING_STARTED;
  if (rewardEligible && rank <= 10) {
    performanceStatus = CA_PROGRAM_CONFIG.statuses.TOP_PERFORMER;
  } else if (rewardEligible) {
    performanceStatus = CA_PROGRAM_CONFIG.statuses.REWARD_ELIGIBLE;
  } else if (certificateEligible) {
    performanceStatus = CA_PROGRAM_CONFIG.statuses.CERTIFICATE_ACHIEVED;
  }

  return {
    points: verifiedPoints,
    totalPoints: verifiedPoints,
    rank,
    verifiedUsers: verifiedUsersCount,
    approvedEvents: approvedEventsCount,
    verifiedOrganizers: verifiedOrganizersCount,
    certificateEligible,
    certificateUnlockedAt,
    rewardEligible,
    rewardEligibleAt,
    performanceStatus,
    pointsBreakdown: {
      userSignups: userSignupPoints,
      organizerPoints,
      adjustments: adjustmentPoints + manualAdjustmentPoints,
      total: verifiedPoints,
    },
    eligibilityChecklist: {
      points: {
        current: verifiedPoints,
        target: reqs.minPoints,
        met: hasMinPoints,
        percentage: Math.min(100, Math.round((verifiedPoints / reqs.minPoints) * 100)),
      },
      verifiedUsers: {
        current: verifiedUsersCount,
        target: reqs.minVerifiedUsers,
        met: hasMinUsers,
        percentage: Math.min(100, Math.round((verifiedUsersCount / reqs.minVerifiedUsers) * 100)),
      },
      approvedEvents: {
        current: approvedEventsCount,
        target: reqs.minApprovedEvents,
        met: hasMinEvents,
        percentage: Math.min(100, Math.round((approvedEventsCount / reqs.minApprovedEvents) * 100)),
      },
      verifiedOrganizers: {
        current: verifiedOrganizersCount,
        target: reqs.minVerifiedOrganizers,
        met: hasMinOrganizers,
        percentage: Math.min(100, Math.round((verifiedOrganizersCount / reqs.minVerifiedOrganizers) * 100)),
      },
      allMet: rewardEligible,
    },
  };
}

/**
 * Reconciles and synchronizes cached CampusAmbassador document fields from ledger
 */
export async function reconcileCAPoints(caId) {
  if (!caId) return null;
  const ca = await CampusAmbassador.findById(caId);
  if (!ca) return null;

  const performance = await calculateCAPerformance(ca);
  if (!performance) return null;

  ca.totalPoints = performance.points;
  ca.certificateEligible = performance.certificateEligible;
  if (performance.certificateEligible && !ca.certificateUnlockedAt) {
    ca.certificateUnlockedAt = performance.certificateUnlockedAt || new Date();
  }
  ca.rewardEligible = performance.rewardEligible;
  if (performance.rewardEligible && !ca.rewardEligibleAt) {
    ca.rewardEligibleAt = performance.rewardEligibleAt || new Date();
  }
  ca.performanceStatus = performance.performanceStatus;

  await ca.save();
  return { ca, performance };
}

/**
 * Idempotently records a verified user signup attribution for a CA
 * Awards +1 point to CA
 */
export async function recordUserSignup(caId, user) {
  if (!caId || !user || !user._id) return null;

  const ca = await CampusAmbassador.findById(caId);
  if (!ca || ca.status !== 'approved') return null;

  // Anti-fraud: prevent self-referral
  if (ca.userId && ca.userId.equals(user._id)) {
    console.warn(`[CA Anti-Fraud] Self-referral prevented for CA ${ca.caId} on user ${user._id}`);
    return null;
  }
  if (ca.email && user.email && ca.email.toLowerCase() === user.email.toLowerCase()) {
    console.warn(`[CA Anti-Fraud] Self-referral by email prevented for CA ${ca.caId} on email ${user.email}`);
    return null;
  }

  const idempotencyKey = `USER_VERIFIED:${user._id.toString()}:${ca._id.toString()}`;

  try {
    const existingEntry = await CAPointLedger.findOne({ idempotencyKey }).lean();
    if (existingEntry) {
      return existingEntry;
    }

    const entry = await CAPointLedger.create({
      caId: ca._id,
      type: 'USER_VERIFIED',
      points: CA_PROGRAM_CONFIG.points.userSignup, // +1
      idempotencyKey,
      refId: user._id,
      refModel: 'User',
      description: `Verified student signup: ${user.name}${user.college ? ` (${user.college})` : ''}`,
      metadata: {
        userId: user._id,
        userName: user.name,
        college: user.college || '',
        city: user.city || '',
      },
    });

    // Update CA stats atomically
    ca.stats = ca.stats || { organizersOnboarded: 0, eventsSourced: 0, referralSignups: 0 };
    ca.stats.referralSignups = (ca.stats.referralSignups || 0) + 1;
    await ca.save();

    await CAReferralLog.create({
      caId: ca._id,
      type: 'student',
      refId: user._id,
      refModel: 'User',
      label: `${user.name}${user.college ? ` (${user.college})` : ''}`,
    }).catch(e => console.error('[CAReferralLog Student Create Error]', e.message));

    await reconcileCAPoints(ca._id);
    return entry;
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key error handled safely and idempotently
      return await CAPointLedger.findOne({ idempotencyKey }).lean();
    }
    console.error('[CA Point Ledger Error - recordUserSignup]', err.message);
    throw err;
  }
}

/**
 * Helper: determines if a user is an actual verified organizer in the FestNest system.
 * Requires role 'organizer', verified email, and valid organization credentials.
 * Regular students (role 'user') who submit events are NOT verified organizers.
 */
export function isVerifiedOrganizer(user) {
  if (!user) return false;
  const isOrganizerRole = user.role === 'organizer';
  const isEmailVerified = user.isEmailVerified === true;
  const hasOrg = Boolean(user.organization && user.organization.trim().length >= 2);
  return isOrganizerRole && isEmailVerified && hasOrg;
}

/**
 * Idempotently records a verified organizer onboarded attribution for a CA
 * Awards +5 points to CA ONLY IF the user is an actual verified organizer
 */
export async function recordOrganizerOnboarded(caId, organizerUser) {
  if (!caId || !organizerUser || !organizerUser._id) return null;

  // Must be an actual verified organizer
  if (!isVerifiedOrganizer(organizerUser)) {
    console.warn(`[CA Attribution] User ${organizerUser._id} is not a verified organizer (role: ${organizerUser.role}). Skipping organizer points.`);
    return null;
  }

  const ca = await CampusAmbassador.findById(caId);
  if (!ca || ca.status !== 'approved') return null;

  // Anti-fraud: prevent self-referral
  if (ca.userId && ca.userId.equals(organizerUser._id)) {
    console.warn(`[CA Anti-Fraud] Self-referral organizer prevented for CA ${ca.caId}`);
    return null;
  }
  if (ca.email && organizerUser.email && ca.email.toLowerCase() === organizerUser.email.toLowerCase()) {
    console.warn(`[CA Anti-Fraud] Self-referral organizer by email prevented for CA ${ca.caId}`);
    return null;
  }

  const organizerId = organizerUser._id.toString();
  const idempotencyKey = `ORGANIZER_VERIFIED:${organizerId}:${ca._id.toString()}`;

  try {
    const existingEntry = await CAPointLedger.findOne({ idempotencyKey }).lean();
    if (existingEntry) {
      return existingEntry;
    }

    // Check if organizer was already counted in CA's referredOrganizerIds
    const alreadyTracked = (ca.referredOrganizerIds || []).some(id => id.equals(organizerUser._id));
    if (alreadyTracked) {
      return null;
    }

    const entry = await CAPointLedger.create({
      caId: ca._id,
      type: 'ORGANIZER_VERIFIED',
      points: CA_PROGRAM_CONFIG.points.organizerOnboarded, // +5
      idempotencyKey,
      refId: organizerUser._id,
      refModel: 'User',
      description: `Verified organizer onboarded: ${organizerUser.organization || organizerUser.name}`,
      metadata: {
        organizerId: organizerUser._id,
        name: organizerUser.name,
        organization: organizerUser.organization || '',
        college: organizerUser.college || '',
      },
    });

    ca.stats = ca.stats || { organizersOnboarded: 0, eventsSourced: 0, referralSignups: 0 };
    ca.stats.organizersOnboarded = (ca.stats.organizersOnboarded || 0) + 1;
    ca.referredOrganizerIds = ca.referredOrganizerIds || [];
    ca.referredOrganizerIds.push(organizerUser._id);
    await ca.save();

    // Also record referral log entry for activity feed
    await CAReferralLog.create({
      caId: ca._id,
      type: 'organizer',
      refId: organizerUser._id,
      refModel: 'User',
      label: `${organizerUser.name}${organizerUser.organization ? ` (${organizerUser.organization})` : ''}`,
    }).catch(e => console.error('[CAReferralLog Create Error]', e.message));

    await reconcileCAPoints(ca._id);
    return entry;
  } catch (err) {
    if (err.code === 11000) {
      return await CAPointLedger.findOne({ idempotencyKey }).lean();
    }
    console.error('[CA Point Ledger Error - recordOrganizerOnboarded]', err.message);
    throw err;
  }
}

/**
 * Idempotently records an approved event for a CA
 * If this is a verified organizer's FIRST approved event, awards +5 additional points (10 points TOTAL for organizer).
 * If subsequent event by same organizer, awards 0 additional points, but increments event count.
 * If event is submitted by a non-organizer student, awards 0 organizer points.
 */
export async function recordEventApproved(caId, event, hostedSubmission) {
  if (!caId || !event || !event._id) return null;

  const ca = await CampusAmbassador.findById(caId);
  if (!ca || ca.status !== 'approved') return null;

  const organizerUserId = hostedSubmission?.submittedBy?._id || hostedSubmission?.submittedBy || event.hostedBy;
  if (!organizerUserId) return null;

  // Anti-fraud: verify submitter is not the CA themselves
  if (ca.userId && ca.userId.equals(organizerUserId)) {
    console.warn(`[CA Anti-Fraud] CA self-event approval ignored for CA ${ca.caId}`);
    return null;
  }

  // Verify whether submitter is an actual verified organizer
  const submitterUser = await User.findById(organizerUserId).select('_id role organization isEmailVerified').lean();
  const isOrganizer = isVerifiedOrganizer(submitterUser);

  let pointEntry = null;

  // Only award organizer first event bonus (+5 pts) if the submitter is an actual verified organizer
  if (isOrganizer) {
    ca.firstEventApprovedOrganizers = ca.firstEventApprovedOrganizers || [];
    const isOrganizerFirstEvent = !ca.firstEventApprovedOrganizers.some(id => id.equals(organizerUserId));

    if (isOrganizerFirstEvent) {
      const firstEventIdempotencyKey = `ORGANIZER_FIRST_EVENT_APPROVED:${organizerUserId.toString()}:${ca._id.toString()}`;
      try {
        pointEntry = await CAPointLedger.create({
          caId: ca._id,
          type: 'ORGANIZER_FIRST_EVENT_APPROVED',
          points: CA_PROGRAM_CONFIG.points.organizerFirstApprovedEvent, // +5 (makes total 10 for organizer)
          idempotencyKey: firstEventIdempotencyKey,
          refId: event._id,
          refModel: 'Event',
          description: `Organizer first event approved (+5 pts upgrade, 10 total): ${event.name}`,
          metadata: {
            eventId: event._id,
            eventName: event.name,
            organizerUserId,
          },
        });

        ca.firstEventApprovedOrganizers.push(organizerUserId);
      } catch (err) {
        if (err.code === 11000) {
          pointEntry = await CAPointLedger.findOne({ idempotencyKey: firstEventIdempotencyKey }).lean();
        } else {
          console.error('[CA Point Ledger Error - first event approval]', err.message);
        }
      }
    }
  }

  // Always update events sourced count atomically
  ca.stats = ca.stats || { organizersOnboarded: 0, eventsSourced: 0, referralSignups: 0 };
  ca.stats.eventsSourced = (ca.stats.eventsSourced || 0) + 1;
  await ca.save();

  // Also record referral log entry for activity feed
  await CAReferralLog.create({
    caId: ca._id,
    type: 'event',
    refId: event._id,
    refModel: 'Event',
    label: `${event.name}${event.college ? ` (${event.college})` : ''}`,
  }).catch(e => console.error('[CAReferralLog Event Create Error]', e.message));

  await reconcileCAPoints(ca._id);
  return pointEntry;
}

/**
 * Returns deterministic, public-safe leaderboard
 */
export async function getLeaderboard({
  period = 'all-time',
  city = '',
  college = '',
  search = '',
  page = 1,
  limit = 50,
} = {}) {
  const filter = { status: 'approved' };

  if (city && city.trim()) {
    filter.city = new RegExp(city.trim(), 'i');
  }

  if (college && college.trim()) {
    filter.college = new RegExp(college.trim(), 'i');
  }

  if (search && search.trim()) {
    const rx = new RegExp(search.trim(), 'i');
    filter.$or = [{ name: rx }, { college: rx }, { city: rx }, { caId: rx }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  // Deterministic sorting hierarchy:
  // 1. totalPoints DESC
  // 2. eventsSourced DESC
  // 3. organizersOnboarded DESC
  // 4. referralSignups DESC
  // 5. createdAt ASC
  const sortCriteria = {
    totalPoints: -1,
    'stats.eventsSourced': -1,
    'stats.organizersOnboarded': -1,
    'stats.referralSignups': -1,
    createdAt: 1,
  };

  const [ambassadors, total] = await Promise.all([
    CampusAmbassador.find(filter)
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNum)
      .select('name college city caId totalPoints performanceStatus certificateEligible rewardEligible stats photoUrl createdAt')
      .lean(),
    CampusAmbassador.countDocuments(filter),
  ]);

  // Map into strictly public-safe output
  const leaderboard = ambassadors.map((ca, idx) => {
    const rank = skip + idx + 1;
    return {
      rank,
      caId: ca.caId || `FN-CA-${rank}`,
      name: ca.name,
      college: ca.college,
      city: ca.city,
      points: ca.totalPoints || 0,
      totalPoints: ca.totalPoints || 0,
      performanceStatus: ca.performanceStatus || (ca.totalPoints >= 100 ? 'Reward Eligible' : ca.totalPoints >= 40 ? 'Certificate Milestone Achieved' : 'Getting Started'),
      photoUrl: ca.photoUrl || null,
      stats: {
        referralSignups: ca.stats?.referralSignups || 0,
        organizersOnboarded: ca.stats?.organizersOnboarded || 0,
        eventsSourced: ca.stats?.eventsSourced || 0,
      },
      certificateEligible: Boolean(ca.certificateEligible),
      rewardEligible: Boolean(ca.rewardEligible),
    };
  });

  return {
    leaderboard,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
    period,
  };
}

/**
 * Freezes a reward snapshot for a specific period (e.g. monthly or final)
 */
export async function createRewardSnapshot({ periodType = 'monthly', periodKey, createdBy = null }) {
  if (!periodKey || !periodKey.trim()) {
    throw new Error('periodKey is required (e.g. "2026-03" or "final-2026")');
  }

  // Check if snapshot already exists for this period
  const existingCount = await CARewardSnapshot.countDocuments({ periodKey });
  if (existingCount > 0) {
    throw new Error(`Reward snapshot for period ${periodKey} already exists. Historical records cannot be overwritten.`);
  }

  // Fetch all approved CAs sorted deterministically
  const sortCriteria = {
    totalPoints: -1,
    'stats.eventsSourced': -1,
    'stats.organizersOnboarded': -1,
    'stats.referralSignups': -1,
    createdAt: 1,
  };

  const ambassadors = await CampusAmbassador.find({ status: 'approved' })
    .sort(sortCriteria)
    .lean();

  const rewardTable = periodType === 'monthly'
    ? CA_PROGRAM_CONFIG.rewards.monthly.ranks
    : CA_PROGRAM_CONFIG.rewards.final.ranks;

  const rewardMap = new Map(rewardTable.map(r => [r.rank, r.amount]));

  const snapshotDocs = [];

  ambassadors.forEach((ca, idx) => {
    const rank = idx + 1;
    const isEligible = Boolean(ca.rewardEligible);
    const potentialAmount = rewardMap.get(rank) || 0;
    const rewardAmount = isEligible ? potentialAmount : 0;
    const status = isEligible && rewardAmount > 0 ? 'PENDING_APPROVAL' : isEligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE';

    snapshotDocs.push({
      periodType,
      periodKey,
      caId: ca._id,
      rank,
      points: ca.totalPoints || 0,
      metrics: {
        verifiedUsers: ca.stats?.referralSignups || 0,
        approvedEvents: ca.stats?.eventsSourced || 0,
        verifiedOrganizers: ca.stats?.organizersOnboarded || 0,
      },
      isEligible,
      rewardAmount,
      status,
      notes: `Snapshot generated for ${periodKey}. Rank ${rank}.`,
    });
  });

  const createdSnapshots = await CARewardSnapshot.insertMany(snapshotDocs);
  return createdSnapshots;
}

export default {
  calculateCAPerformance,
  reconcileCAPoints,
  recordUserSignup,
  recordOrganizerOnboarded,
  recordEventApproved,
  getLeaderboard,
  createRewardSnapshot,
};
