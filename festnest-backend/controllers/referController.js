// controllers/referController.js
import crypto from 'node:crypto';
import User from '../models/User.js';
import { Referral, FnCoinLedger, Spin, RewardConfig } from '../models/index.js';
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
}) {
  const verifiedReferralMilestones = Math.floor(verifiedReferrals / 10);
  const verifiedRegistrationMilestones = Math.floor(uniqueRegisteredReferredUsers / 5);

  const eligibleMilestones = Math.min(
    verifiedReferralMilestones,
    verifiedRegistrationMilestones
  );

  const coinBasedSpins = Math.floor(fnCoins / 200);

  const availableSpins = Math.max(
    0,
    Math.min(eligibleMilestones - consumedMilestones, coinBasedSpins)
  );

  // Progress in the current milestone block towards the next unlock
  const currentReferralProgress = Math.min(
    10,
    Math.max(0, verifiedReferrals - consumedMilestones * 10)
  );
  const currentRegistrationProgress = Math.min(
    5,
    Math.max(0, uniqueRegisteredReferredUsers - consumedMilestones * 5)
  );

  return {
    eligibleMilestones,
    consumedMilestones,
    availableSpins,
    milestone: {
      referrals: {
        count: currentReferralProgress,
        required: 10,
      },
      eventRegistrations: {
        count: currentRegistrationProgress,
        required: 5,
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

  const calc = calculateMilestonesAndSpins({
    verifiedReferrals,
    uniqueRegisteredReferredUsers,
    fnCoins: user.fnCoins || 0,
    consumedMilestones,
  });

  return ok(
    res,
    {
      referralCode: refCode,
      referralLink,
      points: {
        available: user.fnCoins || 0,
        required: 200,
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
        type: winningReward.type === 'fn_coins' ? 'points' : winningReward.type,
        value: winningReward.value,
      },
      pointsRemaining: finalUserCoins,
      spinsRemaining: postSpinsCalc.availableSpins,
    },
    'Spin successful'
  );
});

/* ────────────────────────────────────────────────────────
   ADMIN ENDPOINTS
──────────────────────────────────────────────────────── */

/* GET /api/admin/refer/stats */
export const getAdminReferStats = asyncHandler(async (req, res) => {
  const [
    totalReferrals,
    verifiedReferrals,
    invalidReferrals,
    registeredReferredUsers,
    totalSpins,
    coinsIssuedAgg,
    coinsSpentAgg,
    pendingCashSpins,
    paidCashSpins,
  ] = await Promise.all([
    Referral.countDocuments({}),
    Referral.countDocuments({ status: 'verified' }),
    Referral.countDocuments({ status: 'invalid' }),
    Referral.countDocuments({ status: 'verified', eventStatus: 'registered' }),
    Spin.countDocuments({}),
    FnCoinLedger.aggregate([
      { $match: { amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FnCoinLedger.aggregate([
      { $match: { amount: { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Spin.countDocuments({ 'reward.type': 'cash', status: { $in: ['pending', 'under_review', 'approved'] } }),
    Spin.countDocuments({ 'reward.type': 'cash', status: 'paid' }),
  ]);

  const fnCoinsIssued = coinsIssuedAgg[0]?.total || 0;
  const fnCoinsSpent = Math.abs(coinsSpentAgg[0]?.total || 0);

  return ok(res, {
    referrals: {
      total: totalReferrals,
      verified: verifiedReferrals,
      invalid: invalidReferrals,
      conversionRate: totalReferrals > 0 ? (verifiedReferrals / totalReferrals) * 100 : 0,
    },
    events: {
      registeredReferredUsers,
      registrationConversion:
        verifiedReferrals > 0 ? (registeredReferredUsers / verifiedReferrals) * 100 : 0,
    },
    coins: {
      issued: fnCoinsIssued,
      spent: fnCoinsSpent,
    },
    spins: {
      total: totalSpins,
      pendingCash: pendingCashSpins,
      paidCash: paidCashSpins,
    },
  });
});

/* GET /api/admin/refer/rewards */
export const listAdminRewards = asyncHandler(async (req, res) => {
  await ensureRewardConfigs();
  const rewards = await RewardConfig.find({}).sort({ order: 1 });
  return ok(res, { rewards });
});

/* PATCH /api/admin/refer/rewards/:id */
export const updateAdminReward = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { label, probability, isActive, inventory, maxWinners, order } = req.body;

  const reward = await RewardConfig.findById(id);
  if (!reward) return notFoundRes(res, 'Reward not found');

  if (label !== undefined) reward.label = label.trim();
  if (probability !== undefined) reward.probability = Number(probability);
  if (isActive !== undefined) reward.isActive = Boolean(isActive);
  if (inventory !== undefined) reward.inventory = inventory === null ? null : Number(inventory);
  if (maxWinners !== undefined) reward.maxWinners = maxWinners === null ? null : Number(maxWinners);
  if (order !== undefined) reward.order = Number(order);

  await reward.save();
  return ok(res, { reward }, 'Reward updated');
});

/* GET /api/admin/refer/spins */
export const listAdminSpins = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const status = req.query.status;

  const filter = {};
  if (status) filter.status = status;

  const [total, spins] = await Promise.all([
    Spin.countDocuments(filter),
    Spin.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email phone')
      .populate('processedBy', 'name email')
      .lean(),
  ]);

  return ok(res, {
    spins,
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
  spin.statusReason = statusReason || spin.statusReason;
  spin.processedBy = req.user._id;
  spin.processedAt = new Date();
  if (payoutDetails) {
    spin.payoutDetails = { ...spin.payoutDetails, ...payoutDetails };
  }

  await spin.save();
  return ok(res, { spin }, 'Spin status updated');
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

  // If referral was previously verified, reverse the 10 FN Coins in ledger
  if (wasVerified) {
    const referrer = await User.findById(referral.referrer);
    if (referrer) {
      const updatedCoins = Math.max(0, (referrer.fnCoins || 0) - 10);
      referrer.fnCoins = updatedCoins;
      await referrer.save();

      await FnCoinLedger.create({
        user: referrer._id,
        type: 'fraud_reversal',
        amount: -10,
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

