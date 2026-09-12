// test-refer-lifecycle.js
import { calculateMilestonesAndSpins } from './controllers/referController.js';

console.log('🧪 Starting Refer & Earn + FN Coins unit tests...\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// 1. Milestone & Available Spins Calculation Tests (Spec Section 5)
console.log('Test Suite 1: Milestone and Available Spins Calculations');

// Example 1 from spec: 20 verified referrals, 6 unique registered, 200 FN Coins, 0 consumed
const ex1 = calculateMilestonesAndSpins({
  verifiedReferrals: 20,
  uniqueRegisteredReferredUsers: 6,
  fnCoins: 200,
  consumedMilestones: 0,
});
assert(ex1.eligibleMilestones === 1, 'Ex 1: eligibleMilestones should be 1');
assert(ex1.availableSpins === 1, 'Ex 1: availableSpins should be 1');
assert(ex1.milestone.referrals.count === 10, 'Ex 1: referral progress capped at 10');
assert(ex1.milestone.eventRegistrations.count === 5, 'Ex 1: reg progress capped at 5');

// Example 2 from spec: 20 verified referrals, 10 unique registered, 400 FN Coins, 0 consumed
const ex2 = calculateMilestonesAndSpins({
  verifiedReferrals: 20,
  uniqueRegisteredReferredUsers: 10,
  fnCoins: 400,
  consumedMilestones: 0,
});
assert(ex2.eligibleMilestones === 2, 'Ex 2: eligibleMilestones should be 2');
assert(ex2.availableSpins === 2, 'Ex 2: availableSpins should be 2');

// After consuming 1 spin in Example 2:
const ex2Consumed = calculateMilestonesAndSpins({
  verifiedReferrals: 20,
  uniqueRegisteredReferredUsers: 10,
  fnCoins: 200, // 400 - 200 = 200 remaining
  consumedMilestones: 1,
});
assert(ex2Consumed.availableSpins === 1, 'Ex 2 after 1 spin: availableSpins should be 1');
assert(ex2Consumed.milestone.referrals.count === 10, 'Ex 2 after 1 spin: current referral progress is 10');
assert(ex2Consumed.milestone.eventRegistrations.count === 5, 'Ex 2 after 1 spin: current reg progress is 5');

// Insufficient event registrations: 20 referrals, only 4 registered, 200 FN coins
const exInsufficientReg = calculateMilestonesAndSpins({
  verifiedReferrals: 20,
  uniqueRegisteredReferredUsers: 4,
  fnCoins: 200,
  consumedMilestones: 0,
});
assert(exInsufficientReg.eligibleMilestones === 0, 'Insufficient reg: eligibleMilestones should be 0');
assert(exInsufficientReg.availableSpins === 0, 'Insufficient reg: availableSpins should be 0');
assert(exInsufficientReg.milestone.eventRegistrations.count === 4, 'Insufficient reg: count is 4/5');

// Insufficient FN coins: 20 referrals, 10 registered, only 190 coins
const exInsufficientCoins = calculateMilestonesAndSpins({
  verifiedReferrals: 20,
  uniqueRegisteredReferredUsers: 10,
  fnCoins: 190,
  consumedMilestones: 0,
});
assert(exInsufficientCoins.eligibleMilestones === 2, 'Insufficient coins: eligibleMilestones is 2');
assert(exInsufficientCoins.availableSpins === 0, 'Insufficient coins: availableSpins must be 0 (< 200 coins)');

// Partial progress towards 1st milestone: 7 referrals, 3 registrations, 70 coins
const exPartial = calculateMilestonesAndSpins({
  verifiedReferrals: 7,
  uniqueRegisteredReferredUsers: 3,
  fnCoins: 70,
  consumedMilestones: 0,
});
assert(exPartial.availableSpins === 0, 'Partial: availableSpins is 0');
assert(exPartial.milestone.referrals.count === 7, 'Partial: referrals count is 7/10');
assert(exPartial.milestone.eventRegistrations.count === 3, 'Partial: reg count is 3/5');

// Promotional Bonus Spins: 0 milestones, 0 coins, but 3 bonus spins granted by admin
const exBonusSpins = calculateMilestonesAndSpins({
  verifiedReferrals: 0,
  uniqueRegisteredReferredUsers: 0,
  fnCoins: 0,
  consumedMilestones: 0,
  bonusSpins: 3,
});
assert(exBonusSpins.availableSpins === 3, 'Bonus spins: availableSpins should be 3 from bonusSpins');
assert(exBonusSpins.baseSpins === 0, 'Bonus spins: baseSpins should be 0');

// Dynamic ReferSettings: customized 5 referrals, 2 registrations, 100 coins per spin
const exCustomSettings = calculateMilestonesAndSpins({
  verifiedReferrals: 5,
  uniqueRegisteredReferredUsers: 2,
  fnCoins: 100,
  consumedMilestones: 0,
  bonusSpins: 1,
  referralsPerMilestone: 5,
  registrationsPerMilestone: 2,
  coinsPerSpin: 100,
});
assert(exCustomSettings.eligibleMilestones === 1, 'Custom settings: eligibleMilestones should be 1');
assert(exCustomSettings.baseSpins === 1, 'Custom settings: baseSpins should be 1');
assert(exCustomSettings.availableSpins === 2, 'Custom settings: availableSpins should be 1 base + 1 bonus = 2');
assert(exCustomSettings.milestone.referrals.required === 5, 'Custom settings: referrals.required is 5');
assert(exCustomSettings.milestone.eventRegistrations.required === 2, 'Custom settings: eventRegistrations.required is 2');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);

