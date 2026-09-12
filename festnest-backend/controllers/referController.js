// controllers/referController.js
import crypto from 'node:crypto';
import User from '../models/User.js';
import { Referral, FnCoinLedger, Spin, RewardConfig, ReferSettings } from '../models/index.js';
import { ok, created, fail, notFoundRes, asyncHandler } from '../utils/response.js';

/* ─── Default seed for wheel configuration ─────────────────── */
const DEFAULT_REWARDS = [
  { segmentId: 'cash-25', label: '₹25 Cash', type: 'cash', value: 25, probability: 15, order: 0 },
  { segmentId: 'points-20', label: '+20 FN Coins', type: 'fn_coins', value: 20, probability: 20, order: 1 },
  { segmentId: 'cash-50', label: '₹50 Cash', type: 'cash', value: 50, probability: 5, order: 2 },
  { segmentId: 'none', label: 'Better luck next time', type: 'none', value: null, probability: 24, order: 3 },
  { segmentId: 'cash-10', label: '₹10 Cash', type: 'cash', value: 10, probability: 25, order: 4 },
  { segmentId: 'points-50', label: '+50 FN Coins', type: 'fn_coins', value: 50, probability: 10, order: 5 },
  { segmentId: 'merch-tshirt', label: 'FestNest Merch', type: 'merch', value: null, probability: 1, inventory: 20, order: 6 },
];

/* ─── Ensure reward configs are populated ─────────────────── */
async function ensureRewardConfigs() {
  const count = await RewardConfig.countDocuments({});
  if (count === 0) {
    await RewardConfig.insertMany(DEFAULT_REWARDS);
  }
}

/* ─── Program Settings Helper ─────────────────────────────── */
export async function getReferSettings() {
  let settings = await ReferSettings.findOne();
  if (!settings) {
    try {
      settings = await ReferSettings.create({
        coinsPerReferral: 10,
        coinsPerSpin: 200,
        referralsPerMilestone: 10,
        registrationsPerMilestone: 5,
        programActive: true,
      });
    } catch {
      settings = await ReferSettings.findOne();
    }
  }
  return (
    settings || {
      coinsPerReferral: 10,
      coinsPerSpin: 200,
      referralsPerMilestone: 10,
      registrationsPerMilestone: 5,
      programActive: true,
    }
  );
}

/* ─── Helper: Lazy-generate referral code if user lacks one ── */
export async function ensureReferralCode(user) {
  if (user.referralCode && user.referralCode.trim()) return user.referralCode.trim();

  const base = (user.name || 'FN')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5) || 'FN';

  let code = base + Math.floor(1000 + Math.random() * 9000);
  let attempts = 0;
  while (attempts < 5) {
    try {
      user.referralCode = code;
      await user.save();
      return code;
    } catch (err) {
      if (err.code === 11000) {
        code = base + Math.floor(1000 + Math.random() * 9000);
        attempts++;
      } else {
        throw err;
      }
    }
  }
  return code;
}

/* ─── Milestone & Available Spins Calculation Helper ──────── */
export function calculateMilestonesAndSpins({
  verifiedReferrals,
  uniqueRegisteredReferredUsers,
  fnCoins,
  consumedMilestones = 0,
  bonusSpins = 0,
  referralsPerMilestone = 10,
  registrationsPerMilestone = 5,
  coinsPerSpin = 200,
}) {
  const verifiedReferralMilestones = Math.floor(verifiedReferrals / referralsPerMilestone);
  const verifiedRegistrationMilestones = Math.floor(uniqueRegisteredReferredUsers / registrationsPerMilestone);

  const eligibleMilestones = Math.min(
    verifiedReferralMilestones,
    verifiedRegistrationMilestones
  );

  const coinBasedSpins = Math.floor(fnCoins / coinsPerSpin);

  const baseSpins = Math.max(
    0,
    Math.min(eligibleMilestones - consumedMilestones, coinBasedSpins)
  );

  const availableSpins = baseSpins + Math.max(0, bonusSpins || 0);

  // Progress in the current milestone block towards the next unlock
  const currentReferralProgress = Math.min(
    referralsPerMilestone,
    Math.max(0, verifiedReferrals - consumedMilestones * referralsPerMilestone)
  );
  const currentRegistrationProgress = Math.min(
    registrationsPerMilestone,
    Math.max(0, uniqueRegisteredReferredUsers - consumedMilestones * registrationsPerMilestone)
  );

  return {
    eligibleMilestones,
    consumedMilestones,
    baseSpins,
    bonusSpins: Math.max(0, bonusSpins || 0),
    availableSpins,
    milestone: {
      referrals: {
        count: currentReferralProgress,
        required: referralsPerMilestone,
      },
      eventRegistrations: {
        count: currentRegistrationProgress,
        required: registrationsPerMilestone,
      },
    },
  };
}

/* ────────────────────────────────────────────────────────
   GET /api/refer/summary   (auth required)
──────────────────────────────────────────────────────── */
export const getReferralSummary = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return notFoundRes(res, 'User not found');

  const refCode = await ensureReferralCode(user);
  const clientOrigin = (
    process.env.CLIENT_URL ||
    process.env.CLIENT_ORIGIN ||
    'https://festnest.in'
  )
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');

  const referralLink = `${clientOrigin}?ref=${refCode}`;

  // Counts
  const [
    totalReferrals,
    verifiedReferrals,
    uniqueRegisteredReferredUsers,
    consumedMilestones,
  ] = await Promise.all([
    Referral.countDocuments({ referrer: user._id }),
    Referral.countDocuments({ referrer: user._id, status: 'verified' }),
    // Each record in Referral has unique referredUser, so counting registered gives unique users
    Referral.countDocuments({
      referrer: user._id,
      status: 'verified',
      eventStatus: 'registered',
    }),
    Spin.countDocuments({ user: user._id }),
  ]);
  const settings = await getReferSettings();

  const calc = calculateMilestonesAndSpins({
    verifiedReferrals,
    uniqueRegisteredReferredUsers,
    fnCoins: user.fnCoins || 0,
    consumedMilestones,
    bonusSpins: user.bonusSpins || 0,
    referralsPerMilestone: settings.referralsPerMilestone || 10,
    registrationsPerMilestone: settings.registrationsPerMilestone || 5,
    coinsPerSpin: settings.coinsPerSpin || 200,
  });

  return ok(
    res,
    {
      referralCode: refCode,
      referralLink,
      fnCoins: {
        available: user.fnCoins || 0,
        required: settings.coinsPerSpin || 200,
      },
      points: {
        available: user.fnCoins || 0,
        required: settings.coinsPerSpin || 200,
      },
      milestone: calc.milestone,
      totals: {
        referrals: totalReferrals,
        verifiedReferrals,
        eventRegistrations: uniqueRegisteredReferredUsers,
      },
      availableSpins: calc.availableSpins,
    },
    'Referral summary'
  );
});

/* ────────────────────────────────────────────────────────
   GET /api/refer/history   (auth required)
   Query: ?type=referrals|spins&page=1&limit=8
──────────────────────────────────────────────────────── */
export const getReferralHistory = asyncHandler(async (req, res) => {
  const type = (req.query.type || 'referrals').toString().toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 8));
  const skip = (page - 1) * limit;

  if (type === 'referrals') {
    const records = await Referral.find({ referrer: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit + 1)
      .populate('referredUser', 'name')
      .lean();

    const hasMore = records.length > limit;
    const pageItems = records.slice(0, limit);

    const items = pageItems.map((r) => ({
      id: r._id.toString(),
      name: r.referredUser?.name || 'Referred User',
      date: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      status: r.status, // 'verified' | 'pending' | 'invalid'
      points: r.fnCoinsAwarded || 10,
      eventStatus: r.eventStatus || 'not_registered',
    }));

    return ok(res, { items, hasMore }, 'Referral history');
  }

  if (type === 'spins') {
    const records = await Spin.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit + 1)
      .lean();

    const hasMore = records.length > limit;
    const pageItems = records.slice(0, limit);

    const items = pageItems.map((s) => ({
      id: s._id.toString(),
      date: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
      rewardLabel: s.reward?.label || 'Spin Reward',
      status: s.status, // 'pending' | 'under_review' | 'approved' | 'paid' | 'credited' | 'rejected' | 'cancelled'
    }));

    return ok(res, { items, hasMore }, 'Spin history');
  }

  return fail(res, "Invalid history type. Use 'referrals' or 'spins'", 400);
});

/* ────────────────────────────────────────────────────────
   GET /api/refer/wheel-config   (public / optional auth)
──────────────────────────────────────────────────────── */
export const getWheelConfig = asyncHandler(async (req, res) => {
  await ensureRewardConfigs();

  const configs = await RewardConfig.find({ isActive: true })
    .sort({ order: 1 })
    .lean();

  // Hide probabilities, weights, and internal limits from frontend
  const segments = configs.map((c) => ({
    id: c.segmentId,
    label: c.label,
    // Map fn_coins to 'points' type so ReferAndEarn.jsx REWARD_TYPE_ICON displays Coins icon
    type: c.type === 'fn_coins' ? 'points' : c.type,
    type: c.type,
  }));

  return ok(res, { segments }, 'Wheel configuration');
});

/* ────────────────────────────────────────────────────────
   POST /api/refer/spin   (auth required)
   Body: { idempotencyKey: string }
──────────────────────────────────────────────────────── */
export const spinWheel = asyncHandler(async (req, res) => {
  const { idempotencyKey } = req.body;
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    return fail(res, 'Valid idempotencyKey is required', 400, { code: 'INVALID_KEY' });
  }

  const cleanKey = idempotencyKey.trim();

  // 1. Check if idempotency key was already consumed (handles network retries safely)
  const existingSpin = await Spin.findOne({ idempotencyKey: cleanKey });
  if (existingSpin) {
    const user = await User.findById(req.user._id);
    const [verifiedRefs, uniqueRegs, consumed] = await Promise.all([
      Referral.countDocuments({ referrer: req.user._id, status: 'verified' }),
      Referral.countDocuments({
        referrer: req.user._id,
        status: 'verified',
        eventStatus: 'registered',
      }),
      Spin.countDocuments({ user: req.user._id }),
    ]);

    const calc = calculateMilestonesAndSpins({
      verifiedReferrals: verifiedRefs,
      uniqueRegisteredReferredUsers: uniqueRegs,
      fnCoins: user?.fnCoins || 0,
      consumedMilestones: consumed,
    });

    return ok(
      res,
      {
        spinId: existingSpin._id.toString(),
        winningSegmentId: existingSpin.winningSegmentId,
        reward: {
          label: existingSpin.reward.label,
          type: existingSpin.reward.type === 'fn_coins' ? 'points' : existingSpin.reward.type,
          value: existingSpin.reward.value,
        },
        pointsRemaining: user?.fnCoins || 0,
        spinsRemaining: calc.availableSpins,
      },
      'Spin already processed'
    );
  }

  // 2. Fetch fresh user & check eligibility
  const user = await User.findById(req.user._id);
  if (!user) return notFoundRes(res, 'User not found');

  const [verifiedReferrals, uniqueRegisteredReferredUsers, consumedMilestones] =
    await Promise.all([
      Referral.countDocuments({ referrer: user._id, status: 'verified' }),
      Referral.countDocuments({
        referrer: user._id,
        status: 'verified',
        eventStatus: 'registered',
      }),
      Spin.countDocuments({ user: user._id }),
    ]);

  const calc = calculateMilestonesAndSpins({
    verifiedReferrals,
    uniqueRegisteredReferredUsers,
    fnCoins: user.fnCoins || 0,
    consumedMilestones,
  });

  if (calc.availableSpins <= 0) {
    if ((user.fnCoins || 0) < 200) {
      return res.status(400).json({
        success: false,
        code: 'NOT_ELIGIBLE',
        message: 'You need 200 FN Coins before you can spin the wheel.',
      });
    }
    return res.status(400).json({
      success: false,
      code: 'NO_SPINS_LEFT',
      message:
        'You need to complete the referral and event-registration requirements to unlock a spin.',
    });
  }

  // 3. The milestone index to consume
  const nextMilestoneIndex = consumedMilestones + 1;

  // 4. Server-side weighted selection of reward
  await ensureRewardConfigs();
  const activeRewards = await RewardConfig.find({ isActive: true });

  // Filter out rewards with exhausted inventory or max winners reached
  const eligibleRewards = activeRewards.filter((r) => {
    if (r.inventory !== null && r.inventory <= 0) return false;
    if (r.maxWinners !== null && r.totalWon >= r.maxWinners) return false;
    return r.probability > 0;
  });

  if (eligibleRewards.length === 0) {
    return fail(res, 'Spin wheel is temporarily unavailable. Please try again later.', 503);
  }

  const totalWeight = eligibleRewards.reduce((sum, r) => sum + r.probability, 0);
  const randomRoll = Math.random() * totalWeight;

  let cumulative = 0;
  let winningReward = eligibleRewards[0];
  for (const reward of eligibleRewards) {
    cumulative += reward.probability;
    if (randomRoll <= cumulative) {
      winningReward = reward;
      break;
    }
  }

  // 5. Deduct 200 FN Coins atomically with balance check
  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id, fnCoins: { $gte: 200 } },
    { $inc: { fnCoins: -200 } },
    { new: true }
  );

  if (!updatedUser) {
    return res.status(400).json({
      success: false,
      code: 'NOT_ELIGIBLE',
      message: 'Insufficient FN Coins to spin the wheel.',
    });
  }

  // Record 200 deduction in FnCoinLedger
  const costLedger = await FnCoinLedger.create({
    user: user._id,
    type: 'spin_cost',
    amount: -200,
    balanceAfter: updatedUser.fnCoins,
    description: 'Spin wheel cost',
    metadata: {
      milestoneIndex: nextMilestoneIndex,
      idempotencyKey: cleanKey,
    },
  });

  // 6. Decrement inventory / increment win count
  if (winningReward.inventory !== null) {
    await RewardConfig.findByIdAndUpdate(winningReward._id, {
      $inc: { inventory: -1, totalWon: 1 },
    });
  } else {
    await RewardConfig.findByIdAndUpdate(winningReward._id, {
      $inc: { totalWon: 1 },
    });
  }

  // 7. Process winning reward:
  // - fn_coins are credited immediately
  // - cash rewards are marked 'pending' for review & payout
  // - none and bonus_spin are marked 'credited'
  let finalUserCoins = updatedUser.fnCoins;
  const initialStatus =
    winningReward.type === 'fn_coins' ||
    winningReward.type === 'none' ||
    winningReward.type === 'bonus_spin'
      ? 'credited'
      : 'pending';

  let spinRecord;
  try {
    spinRecord = await Spin.create({
      user: user._id,
      idempotencyKey: cleanKey,
      milestoneIndex: nextMilestoneIndex,
      fnCoinsDeducted: 200,
      winningSegmentId: winningReward.segmentId,
      reward: {
        label: winningReward.label,
        type: winningReward.type,
        value: winningReward.value,
      },
      status: initialStatus,
    });
  } catch (spinErr) {
    // If concurrent race condition occurred (duplicate idempotency key or milestone index)
    if (spinErr.code === 11000) {
      // Refund the 200 FN Coins
      await User.findByIdAndUpdate(user._id, { $inc: { fnCoins: 200 } });
      await FnCoinLedger.create({
        user: user._id,
        type: 'admin_adjustment',
        amount: 200,
        balanceAfter: user.fnCoins,
        description: 'Automatic refund: duplicate spin attempt',
      });
      return res.status(409).json({
        success: false,
        code: 'ALREADY_PROCESSING',
        message: 'Your spin is already being processed. Please check your spin history.',
      });
    }
    throw spinErr;
  }

  // Update cost ledger with spin reference
  costLedger.referenceModel = 'Spin';
  costLedger.referenceId = spinRecord._id;
  await costLedger.save();

  // If reward is fn_coins, credit them to the user and create ledger record
  if (winningReward.type === 'fn_coins' && winningReward.value > 0) {
    const creditedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { fnCoins: winningReward.value } },
      { new: true }
    );
    finalUserCoins = creditedUser.fnCoins;

    await FnCoinLedger.create({
      user: user._id,
      type: 'spin_reward_coins',
      amount: winningReward.value,
      balanceAfter: finalUserCoins,
      referenceModel: 'Spin',
      referenceId: spinRecord._id,
      description: `Spin wheel reward: ${winningReward.label}`,
      metadata: { winningSegmentId: winningReward.segmentId },
    });
  }

  // 8. Compute remaining spins
  const postSpinsCalc = calculateMilestonesAndSpins({
    verifiedReferrals,
    uniqueRegisteredReferredUsers,
    fnCoins: finalUserCoins,
    consumedMilestones: nextMilestoneIndex,
  });

  return ok(
    res,
    {
      spinId: spinRecord._id.toString(),
      winningSegmentId: winningReward.segmentId,
      reward: {
        label: winningReward.label,
        type: winningReward.type,
        value: winningReward.value,
      },
      fnCoinsRemaining: finalUserCoins,
      pointsRemaining: finalUserCoins,
      spinsRemaining: postSpinsCalc.availableSpins,
    },
    'Spin successful'
  );
});

/* ────────────────────────────────────────────────────────
   ADMIN ENDPOINTS — SUPREME OPERATIONAL CONTROL
──────────────────────────────────────────────────────── */

/* GET /api/admin/refer/stats */
export const getAdminReferStats = asyncHandler(async (req, res) => {
  const [
    totalReferrals,
    verifiedReferrals,
    invalidReferrals,
    pendingReferrals,
    registeredReferredUsers,
    totalSpins,
    todaySpins,
    coinsIssuedAgg,
    coinsSpentAgg,
    coinsWheelAgg,
    coinsReversedAgg,
    adminAdjustmentsAgg,
    coinsCirculationAgg,
    pendingCashSpins,
    underReviewCashSpins,
    approvedCashSpins,
    paidCashSpins,
    rejectedSpins,
    cashPaidSumAgg,
    rewardTypeCounts,
  ] = await Promise.all([
    Referral.countDocuments({}),
    Referral.countDocuments({ status: 'verified' }),
    Referral.countDocuments({ status: 'invalid' }),
    Referral.countDocuments({ status: 'pending' }),
    Referral.countDocuments({ status: 'verified', eventStatus: 'registered' }),
    Spin.countDocuments({ 'metadata.isTest': { $ne: true } }),
    Spin.countDocuments({
      'metadata.isTest': { $ne: true },
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
    FnCoinLedger.aggregate([
      { $match: { type: 'referral_reward', amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FnCoinLedger.aggregate([
      { $match: { type: 'spin_cost' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FnCoinLedger.aggregate([
      { $match: { type: 'spin_reward_coins' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FnCoinLedger.aggregate([
      { $match: { type: 'fraud_reversal' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FnCoinLedger.aggregate([
      { $match: { type: 'admin_adjustment', 'metadata.isTest': { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    User.aggregate([
      { $group: { _id: null, total: { $sum: '$fnCoins' } } },
    ]),
    Spin.countDocuments({ 'reward.type': 'cash', status: 'pending', 'metadata.isTest': { $ne: true } }),
    Spin.countDocuments({ 'reward.type': 'cash', status: 'under_review', 'metadata.isTest': { $ne: true } }),
    Spin.countDocuments({ 'reward.type': 'cash', status: 'approved', 'metadata.isTest': { $ne: true } }),
    Spin.countDocuments({ 'reward.type': 'cash', status: 'paid', 'metadata.isTest': { $ne: true } }),
    Spin.countDocuments({ status: { $in: ['rejected', 'cancelled'] }, 'metadata.isTest': { $ne: true } }),
    Spin.aggregate([
      { $match: { 'reward.type': 'cash', status: 'paid', 'metadata.isTest': { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$reward.value' } } },
    ]),
    Spin.aggregate([
      { $match: { 'metadata.isTest': { $ne: true } } },
      { $group: { _id: '$reward.type', count: { $sum: 1 } } },
    ]),
  ]);

  const fnCoinsIssued = coinsIssuedAgg[0]?.total || 0;
  const fnCoinsSpent = Math.abs(coinsSpentAgg[0]?.total || 0);
  const fnCoinsFromWheel = coinsWheelAgg[0]?.total || 0;
  const fnCoinsReversed = Math.abs(coinsReversedAgg[0]?.total || 0);
  const fnCoinsAdminAdjustments = adminAdjustmentsAgg[0]?.total || 0;
  const currentInCirculation = coinsCirculationAgg[0]?.total || 0;
  const totalCashPaid = cashPaidSumAgg[0]?.total || 0;

  const rewardDist = {};
  rewardTypeCounts.forEach((r) => {
    rewardDist[r._id] = r.count;
  });

  return ok(res, {
    overview: {
      totalReferrals,
      verifiedReferrals,
      invalidReferrals,
      pendingReferrals,
      registeredReferredUsers,
      conversionRate: totalReferrals > 0 ? (verifiedReferrals / totalReferrals) * 100 : 0,
      registrationConversion:
        verifiedReferrals > 0 ? (registeredReferredUsers / verifiedReferrals) * 100 : 0,
    },
    coins: {
      issued: fnCoinsIssued,
      spentOnSpins: fnCoinsSpent,
      awardedFromWheel: fnCoinsFromWheel,
      reversed: fnCoinsReversed,
      adminAdjustments: fnCoinsAdminAdjustments,
      inCirculation: currentInCirculation,
    },
    spins: {
      total: totalSpins,
      today: todaySpins,
      pending: pendingCashSpins + underReviewCashSpins,
      completed: paidCashSpins,
      cancelled: rejectedSpins,
    },
    rewards: {
      totalWon: totalSpins,
      cash: rewardDist.cash || 0,
      fn_coins: rewardDist.fn_coins || 0,
      merch: rewardDist.merch || 0,
      bonus_spin: rewardDist.bonus_spin || 0,
      none: rewardDist.none || 0,
    },
    cash: {
      pending: pendingCashSpins,
      underReview: underReviewCashSpins,
      approved: approvedCashSpins,
      paid: paidCashSpins,
      totalCashPaid,
    },
  });
});

/* GET /api/admin/refer/referrals */
export const listAdminReferrals = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { status, eventStatus, search } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (eventStatus) filter.eventStatus = eventStatus;

  if (search && search.trim()) {
    const s = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { referralCode: { $regex: s, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    const userIds = matchingUsers.map((u) => u._id);
    filter.$or = [
      { referrer: { $in: userIds } },
      { referredUser: { $in: userIds } },
    ];
  }

  const [total, referrals] = await Promise.all([
    Referral.countDocuments(filter),
    Referral.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('referrer', 'name email referralCode fnCoins')
      .populate('referredUser', 'name email createdAt')
      .populate('registeredEvent', 'title slug')
      .populate('invalidatedBy', 'name email')
      .lean(),
  ]);

  return ok(res, {
    items: referrals,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

/* GET /api/admin/refer/referrals/:id */
export const getAdminReferralDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const referral = await Referral.findById(id)
    .populate('referrer', 'name email phone referralCode fnCoins bonusSpins points')
    .populate('referredUser', 'name email phone createdAt isEmailVerified')
    .populate('registeredEvent', 'title slug')
    .populate('invalidatedBy', 'name email')
    .lean();

  if (!referral) return notFoundRes(res, 'Referral record not found');
  return ok(res, { referral });
});

/* GET /api/admin/refer/users/:id */
export const getAdminUserReferProfile = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id)
    .select('name email phone role fnCoins bonusSpins points referralCode createdAt')
    .lean();
  if (!user) return notFoundRes(res, 'User not found');

  const settings = await getReferSettings();

  const [
    totalReferrals,
    verifiedReferrals,
    invalidReferrals,
    uniqueRegisteredUsers,
    totalSpins,
    referrals,
    ledgerEntries,
  ] = await Promise.all([
    Referral.countDocuments({ referrer: user._id }),
    Referral.countDocuments({ referrer: user._id, status: 'verified' }),
    Referral.countDocuments({ referrer: user._id, status: 'invalid' }),
    Referral.countDocuments({ referrer: user._id, status: 'verified', eventStatus: 'registered' }),
    Spin.countDocuments({ user: user._id }),
    Referral.find({ referrer: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('referredUser', 'name email')
      .populate('registeredEvent', 'title slug')
      .lean(),
    FnCoinLedger.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const calc = calculateMilestonesAndSpins({
    verifiedReferrals,
    uniqueRegisteredReferredUsers: uniqueRegisteredUsers,
    fnCoins: user.fnCoins || 0,
    consumedMilestones: totalSpins,
    bonusSpins: user.bonusSpins || 0,
    referralsPerMilestone: settings.referralsPerMilestone || 10,
    registrationsPerMilestone: settings.registrationsPerMilestone || 5,
    coinsPerSpin: settings.coinsPerSpin || 200,
  });

  return ok(res, {
    user,
    stats: {
      totalReferrals,
      verifiedReferrals,
      invalidReferrals,
      uniqueRegisteredUsers,
      consumedSpins: totalSpins,
      availableSpins: calc.availableSpins,
      baseSpins: calc.baseSpins,
      bonusSpins: user.bonusSpins || 0,
      eligibleMilestones: calc.eligibleMilestones,
      milestone: calc.milestone,
    },
    referrals,
    ledger: ledgerEntries,
  });
});

/* GET /api/admin/refer/ledger */
export const listAdminLedger = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { type, userId, direction, search } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (userId) filter.user = userId;
  if (direction === 'credit') filter.amount = { $gt: 0 };
  if (direction === 'debit') filter.amount = { $lt: 0 };

  if (search && search.trim()) {
    const s = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    const userIds = matchingUsers.map((u) => u._id);
    filter.$or = [
      { user: { $in: userIds } },
      { description: { $regex: s, $options: 'i' } },
    ];
  }

  const [total, items] = await Promise.all([
    FnCoinLedger.countDocuments(filter),
    FnCoinLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email referralCode')
      .lean(),
  ]);

  return ok(res, {
    items,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

/* POST /api/admin/refer/test/grant-coins */
export const grantAdminTestCoins = asyncHandler(async (req, res) => {
  const { amount, reason = 'Admin testing' } = req.body;
  const numAmount = parseInt(amount, 10);

  if (!numAmount || Number.isNaN(numAmount) || numAmount <= 0) {
    return fail(res, 'Amount must be a positive integer greater than 0', 400);
  }
  if (numAmount > 10000) {
    return fail(res, 'Maximum test grant is 10,000 FN Coins per request', 400);
  }

  // Strictly target req.user._id (authenticated admin)
  const user = await User.findById(req.user._id);
  if (!user) return notFoundRes(res, 'Admin user not found');

  const previousBalance = user.fnCoins || 0;
  const newBalance = previousBalance + numAmount;
  user.fnCoins = newBalance;
  await user.save();

  const ledgerEntry = await FnCoinLedger.create({
    user: user._id,
    type: 'admin_adjustment',
    amount: numAmount,
    balanceAfter: newBalance,
    referenceModel: 'User',
    referenceId: user._id,
    description: reason ? `Admin test grant: ${reason.trim()} (+${numAmount} FN Coins)` : `Admin test grant: +${numAmount} FN Coins`,
    metadata: {
      source: 'admin_test_grant',
      adminId: req.user._id,
      adminEmail: req.user.email,
      previousBalance,
      newBalance,
      isTest: true,
      timestamp: new Date(),
    },
  });

  return ok(res, {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      fnCoins: user.fnCoins,
    },
    amountGranted: numAmount,
    ledgerEntry,
  }, `Successfully granted +${numAmount} FN Coins to your admin account`);
});

/* POST /api/admin/refer/test/reset-coins */
export const resetAdminTestCoins = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return notFoundRes(res, 'Admin user not found');

  const currentCoins = user.fnCoins || 0;
  if (currentCoins <= 0) {
    return ok(res, { fnCoins: 0 }, 'Your FN Coins balance is already 0');
  }

  user.fnCoins = 0;
  await user.save();

  const ledgerEntry = await FnCoinLedger.create({
    user: user._id,
    type: 'admin_adjustment',
    amount: -currentCoins,
    balanceAfter: 0,
    referenceModel: 'User',
    referenceId: user._id,
    description: `Admin test coins reset (-${currentCoins} FN Coins)`,
    metadata: {
      source: 'admin_test_reset',
      adminId: req.user._id,
      adminEmail: req.user.email,
      previousBalance: currentCoins,
      newBalance: 0,
      isTest: true,
      timestamp: new Date(),
    },
  });

  return ok(res, {
    fnCoins: 0,
    deducted: currentCoins,
    ledgerEntry,
  }, `Reset admin test FN Coins to 0. (Recorded -${currentCoins} in ledger)`);
});

/* POST /api/admin/refer/users/:id/adjust-coins */
export const adjustUserCoins = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;
  const numAmount = parseInt(amount, 10);

  if (!numAmount || Number.isNaN(numAmount)) {
    return fail(res, 'Amount must be a non-zero integer', 400);
  }
  if (!reason || !reason.trim()) {
    return fail(res, 'Reason is required for manual coin adjustment', 400);
  }

  const user = await User.findById(id);
  if (!user) return notFoundRes(res, 'Target user not found');

  const previousBalance = user.fnCoins || 0;
  const newBalance = Math.max(0, previousBalance + numAmount);
  const actualDelta = newBalance - previousBalance;

  user.fnCoins = newBalance;
  await user.save();

  const ledgerEntry = await FnCoinLedger.create({
    user: user._id,
    type: 'admin_adjustment',
    amount: actualDelta,
    balanceAfter: newBalance,
    referenceModel: 'User',
    referenceId: user._id,
    description: `Admin adjustment: ${reason.trim()} (${actualDelta >= 0 ? '+' : ''}${actualDelta} FN Coins)`,
    metadata: {
      source: 'admin_manual_adjustment',
      adminId: req.user._id,
      adminEmail: req.user.email,
      reason: reason.trim(),
      previousBalance,
      newBalance,
      timestamp: new Date(),
    },
  });

  return ok(res, {
    user: { id: user._id, name: user.name, email: user.email, fnCoins: user.fnCoins },
    delta: actualDelta,
    ledgerEntry,
  }, `Adjusted ${user.name}'s balance by ${actualDelta >= 0 ? '+' : ''}${actualDelta} FN Coins`);
});

/* POST /api/admin/refer/users/:id/bonus-spins */
export const adjustUserBonusSpins = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;
  const numAmount = parseInt(amount, 10);

  if (!numAmount || Number.isNaN(numAmount)) {
    return fail(res, 'Amount must be a non-zero integer', 400);
  }
  if (!reason || !reason.trim()) {
    return fail(res, 'Reason is required for bonus spins modification', 400);
  }

  const user = await User.findById(id);
  if (!user) return notFoundRes(res, 'Target user not found');

  const previousSpins = user.bonusSpins || 0;
  const newSpins = Math.max(0, previousSpins + numAmount);
  const delta = newSpins - previousSpins;

  user.bonusSpins = newSpins;
  await user.save();

  return ok(res, {
    user: { id: user._id, name: user.name, email: user.email, bonusSpins: user.bonusSpins },
    delta,
    previousSpins,
    newSpins,
  }, `${delta >= 0 ? 'Granted +' : 'Revoked '}${Math.abs(delta)} promotional spin(s) for ${user.name}`);
});

/* POST /api/admin/refer/test/spin */
export const adminTestSpin = asyncHandler(async (req, res) => {
  const { forcedSegmentId, deductCoins = false } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) return notFoundRes(res, 'Admin user not found');

  await ensureRewardConfigs();
  const activeRewards = await RewardConfig.find({ isActive: true });

  if (activeRewards.length === 0) {
    return fail(res, 'No active reward segments configured', 400);
  }

  let winningReward = null;
  if (forcedSegmentId) {
    winningReward = activeRewards.find((r) => r.segmentId === forcedSegmentId);
    if (!winningReward) {
      return fail(res, `Segment with ID "${forcedSegmentId}" not found or inactive`, 404);
    }
  } else {
    const eligibleRewards = activeRewards.filter((r) => r.probability > 0);
    const totalWeight = eligibleRewards.reduce((sum, r) => sum + r.probability, 0);
    const randomRoll = Math.random() * totalWeight;

    let cumulative = 0;
    winningReward = eligibleRewards[0];
    for (const reward of eligibleRewards) {
      cumulative += reward.probability;
      if (randomRoll <= cumulative) {
        winningReward = reward;
        break;
      }
    }
  }

  let finalCoins = user.fnCoins || 0;
  if (deductCoins) {
    if (finalCoins >= 200) {
      finalCoins -= 200;
      user.fnCoins = finalCoins;
      await user.save();
      await FnCoinLedger.create({
        user: user._id,
        type: 'admin_adjustment',
        amount: -200,
        balanceAfter: finalCoins,
        description: 'Admin test spin deduction (-200 FN Coins)',
        metadata: { source: 'admin_test_spin', isTest: true },
      });
    }
  }

  // Create isolated test spin
  const testSpin = await Spin.create({
    user: user._id,
    idempotencyKey: `test-spin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    milestoneIndex: 0,
    fnCoinsDeducted: deductCoins ? 200 : 0,
    winningSegmentId: winningReward.segmentId,
    reward: {
      label: winningReward.label,
      type: winningReward.type,
      value: winningReward.value,
    },
    status: winningReward.type === 'fn_coins' || winningReward.type === 'none' ? 'credited' : 'under_review',
    statusReason: 'Admin isolated test spin',
    metadata: {
      isTest: true,
      testAdminId: req.user._id,
      testTimestamp: new Date(),
    },
  });

  return ok(res, {
    spinId: testSpin._id.toString(),
    winningSegmentId: winningReward.segmentId,
    reward: winningReward,
    fnCoinsRemaining: finalCoins,
    isTest: true,
  }, `Test spin completed: won "${winningReward.label}"`);
});

/* POST /api/admin/refer/referrals/:id/invalidate */
export const invalidateReferral = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason = 'Identified as fraudulent referral' } = req.body;

  const referral = await Referral.findById(id);
  if (!referral) return notFoundRes(res, 'Referral not found');

  if (referral.status === 'invalid') {
    return ok(res, { referral }, 'Referral already invalidated');
  }

  const wasVerified = referral.status === 'verified';
  referral.status = 'invalid';
  referral.invalidatedAt = new Date();
  referral.invalidationReason = reason;
  referral.invalidatedBy = req.user._id;
  await referral.save();

  // If referral was previously verified, reverse the awarded FN Coins in ledger
  if (wasVerified) {
    const referrer = await User.findById(referral.referrer);
    if (referrer) {
      const deduction = referral.fnCoinsAwarded || 10;
      const updatedCoins = Math.max(0, (referrer.fnCoins || 0) - deduction);
      referrer.fnCoins = updatedCoins;
      await referrer.save();

      await FnCoinLedger.create({
        user: referrer._id,
        type: 'fraud_reversal',
        amount: -deduction,
        balanceAfter: updatedCoins,
        referenceModel: 'Referral',
        referenceId: referral._id,
        description: `Fraud reversal: ${reason}`,
        metadata: {
          invalidatedBy: req.user._id,
          reason,
        },
      });
    }
  }

  return ok(res, { referral }, 'Referral invalidated and points reversed in ledger');
});

/* POST /api/admin/refer/referrals/:id/restore */
export const restoreReferral = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason = 'Admin restored referral validity' } = req.body;

  const referral = await Referral.findById(id);
  if (!referral) return notFoundRes(res, 'Referral not found');

  if (referral.status === 'verified') {
    return ok(res, { referral }, 'Referral is already verified');
  }

  const previousStatus = referral.status;
  referral.status = 'verified';
  referral.invalidatedAt = null;
  referral.invalidationReason = '';
  referral.invalidatedBy = null;
  await referral.save();

  // Restore awarded FN Coins to referrer
  const referrer = await User.findById(referral.referrer);
  if (referrer) {
    const coinsToRestore = referral.fnCoinsAwarded || 10;
    const updatedCoins = (referrer.fnCoins || 0) + coinsToRestore;
    referrer.fnCoins = updatedCoins;
    await referrer.save();

    await FnCoinLedger.create({
      user: referrer._id,
      type: 'admin_adjustment',
      amount: coinsToRestore,
      balanceAfter: updatedCoins,
      referenceModel: 'Referral',
      referenceId: referral._id,
      description: `Referral restored by admin: ${reason}`,
      metadata: {
        adminId: req.user._id,
        adminEmail: req.user.email,
        previousStatus,
        newStatus: 'verified',
        reason,
      },
    });
  }

  return ok(res, { referral }, 'Referral restored to verified status and coins re-credited');
});

/* POST /api/admin/refer/referrals/:id/verify-registration */
export const verifyReferralRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    verificationSource = 'manual_admin_verification',
    registeredEventId = null,
  } = req.body;

  const referral = await Referral.findById(id);
  if (!referral) return notFoundRes(res, 'Referral not found');

  referral.eventStatus = 'registered';
  referral.eventRegistrationVerificationSource = verificationSource;
  referral.registeredEvent = registeredEventId;
  referral.eventRegisteredAt = new Date();
  await referral.save();

  return ok(res, { referral }, 'Referral event registration verified');
});

/* POST /api/admin/refer/referrals/:id/unverify-registration */
export const unverifyReferralRegistration = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const referral = await Referral.findById(id);
  if (!referral) return notFoundRes(res, 'Referral not found');

  referral.eventStatus = 'not_registered';
  referral.eventRegistrationVerificationSource = null;
  referral.registeredEvent = null;
  referral.eventRegisteredAt = null;
  await referral.save();

  return ok(res, { referral }, 'Referral registration qualification reset to not_registered');
});

/* PATCH /api/admin/refer/referrals/:id/override */
export const overrideReferralState = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, eventStatus, fnCoinsAwarded, reason } = req.body;

  if (!reason || !reason.trim()) {
    return fail(res, 'Reason is mandatory for operational overrides', 400);
  }

  const referral = await Referral.findById(id);
  if (!referral) return notFoundRes(res, 'Referral not found');

  const previousState = {
    status: referral.status,
    eventStatus: referral.eventStatus,
    fnCoinsAwarded: referral.fnCoinsAwarded,
  };

  if (status && ['pending', 'verified', 'invalid'].includes(status)) {
    referral.status = status;
  }
  if (eventStatus && ['registered', 'not_registered', 'pending'].includes(eventStatus)) {
    referral.eventStatus = eventStatus;
  }
  if (typeof fnCoinsAwarded === 'number' && fnCoinsAwarded >= 0) {
    referral.fnCoinsAwarded = fnCoinsAwarded;
  }

  await referral.save();

  return ok(res, {
    referral,
    previousState,
    reason: reason.trim(),
    overriddenBy: req.user._id,
  }, 'Referral state successfully overridden');
});

/* GET /api/admin/refer/rewards */
export const listAdminRewards = asyncHandler(async (req, res) => {
  await ensureRewardConfigs();
  const rewards = await RewardConfig.find({}).sort({ order: 1 });
  return ok(res, { rewards });
});

/* POST /api/admin/refer/rewards */
export const createAdminReward = asyncHandler(async (req, res) => {
  const { segmentId, label, type, value, probability, inventory, maxWinners, order, isActive } = req.body;

  if (!segmentId || !segmentId.trim()) return fail(res, 'Segment ID is required', 400);
  if (!label || !label.trim()) return fail(res, 'Label is required', 400);
  if (!['cash', 'fn_coins', 'merch', 'bonus_spin', 'none'].includes(type)) {
    return fail(res, 'Invalid reward type', 400);
  }
  if (probability === undefined || probability < 0) {
    return fail(res, 'Probability must be a non-negative number', 400);
  }

  const existing = await RewardConfig.findOne({ segmentId: segmentId.trim() });
  if (existing) return fail(res, 'A segment with this ID already exists', 409);

  const reward = await RewardConfig.create({
    segmentId: segmentId.trim(),
    label: label.trim(),
    type,
    value: value !== undefined && value !== null && value !== '' ? Number(value) : null,
    probability: Number(probability),
    inventory: inventory !== undefined && inventory !== null && inventory !== '' ? Number(inventory) : null,
    maxWinners: maxWinners !== undefined && maxWinners !== null && maxWinners !== '' ? Number(maxWinners) : null,
    order: order !== undefined && order !== '' ? Number(order) : 0,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
  });

  return created(res, { reward }, 'Reward segment created successfully');
});

/* PATCH /api/admin/refer/rewards/:id */
export const updateAdminReward = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { label, type, value, probability, isActive, inventory, maxWinners, order } = req.body;

  const reward = await RewardConfig.findById(id);
  if (!reward) return notFoundRes(res, 'Reward not found');

  if (label !== undefined) reward.label = label.trim();
  if (type !== undefined && ['cash', 'fn_coins', 'merch', 'bonus_spin', 'none'].includes(type)) {
    reward.type = type;
  }
  if (value !== undefined) reward.value = value === null || value === '' ? null : Number(value);
  if (probability !== undefined) reward.probability = Number(probability);
  if (isActive !== undefined) reward.isActive = Boolean(isActive);
  if (inventory !== undefined) reward.inventory = inventory === null || inventory === '' ? null : Number(inventory);
  if (maxWinners !== undefined) reward.maxWinners = maxWinners === null || maxWinners === '' ? null : Number(maxWinners);
  if (order !== undefined) reward.order = Number(order);

  await reward.save();
  return ok(res, { reward }, 'Reward updated successfully');
});

/* DELETE /api/admin/refer/rewards/:id */
export const deleteAdminReward = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reward = await RewardConfig.findByIdAndDelete(id);
  if (!reward) return notFoundRes(res, 'Reward not found');
  return ok(res, { id }, 'Reward deleted successfully');
});

/* GET /api/admin/refer/spins */
export const listAdminSpins = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { status, type, search } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (type) filter['reward.type'] = type;

  if (search && search.trim()) {
    const s = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    const userIds = matchingUsers.map((u) => u._id);
    filter.$or = [
      { user: { $in: userIds } },
      { 'reward.label': { $regex: s, $options: 'i' } },
    ];
  }

  const [total, spins] = await Promise.all([
    Spin.countDocuments(filter),
    Spin.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email phone referralCode')
      .populate('processedBy', 'name email')
      .lean(),
  ]);

  return ok(res, {
    items: spins,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

/* PATCH /api/admin/refer/spins/:id/status */
export const updateAdminSpinStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, statusReason, payoutDetails } = req.body;

  const validStatuses = [
    'pending',
    'under_review',
    'approved',
    'paid',
    'credited',
    'rejected',
    'cancelled',
  ];
  if (!validStatuses.includes(status)) {
    return fail(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
  }

  const spin = await Spin.findById(id);
  if (!spin) return notFoundRes(res, 'Spin not found');

  spin.status = status;
  if (statusReason) spin.statusReason = statusReason.trim();
  spin.processedBy = req.user._id;
  spin.processedAt = new Date();
  if (payoutDetails) {
    spin.payoutDetails = { ...spin.payoutDetails, ...payoutDetails };
  }

  await spin.save();
  return ok(res, { spin }, `Spin status updated to "${status}"`);
});

/* GET /api/admin/refer/settings */
export const getAdminReferSettings = asyncHandler(async (req, res) => {
  const settings = await getReferSettings();
  return ok(res, { settings });
});

/* PATCH /api/admin/refer/settings */
export const updateAdminReferSettings = asyncHandler(async (req, res) => {
  const {
    coinsPerReferral,
    coinsPerSpin,
    referralsPerMilestone,
    registrationsPerMilestone,
    programActive,
  } = req.body;

  let settings = await ReferSettings.findOne();
  if (!settings) {
    settings = new ReferSettings();
  }

  if (coinsPerReferral !== undefined) settings.coinsPerReferral = Math.max(1, Number(coinsPerReferral));
  if (coinsPerSpin !== undefined) settings.coinsPerSpin = Math.max(10, Number(coinsPerSpin));
  if (referralsPerMilestone !== undefined) settings.referralsPerMilestone = Math.max(1, Number(referralsPerMilestone));
  if (registrationsPerMilestone !== undefined) settings.registrationsPerMilestone = Math.max(1, Number(registrationsPerMilestone));
  if (programActive !== undefined) settings.programActive = Boolean(programActive);

  settings.updatedBy = req.user._id;
  await settings.save();

  return ok(res, { settings }, 'Referral settings updated successfully');
});


