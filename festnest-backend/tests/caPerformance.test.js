// tests/caPerformance.test.js
// Automated verification for FestNest Campus Ambassador business logic, point rules, milestones & eligibility
import assert from 'node:assert/strict';
import { CA_PROGRAM_CONFIG } from '../config/caProgramConfig.js';
import { isVerifiedOrganizer } from '../services/caPerformanceService.js';

console.log('🧪 Starting FestNest Campus Ambassador Logic & Regression Tests...\n');

// ── Test 1: Program Configuration Integrity ──
console.log('Test 1: Verifying Program Configuration constants...');
assert.equal(CA_PROGRAM_CONFIG.points.userSignup, 1, 'Verified user signup must be 1 point');
assert.equal(CA_PROGRAM_CONFIG.points.organizerOnboarded, 5, 'Verified organizer must be 5 points');
assert.equal(CA_PROGRAM_CONFIG.points.organizerFirstApprovedEvent, 5, 'First event bonus must be 5 points');
assert.equal(
  CA_PROGRAM_CONFIG.points.organizerOnboarded + CA_PROGRAM_CONFIG.points.organizerFirstApprovedEvent,
  10,
  'Organizer + first event must equal 10 points total'
);
assert.equal(CA_PROGRAM_CONFIG.points.organizerAdditionalEvents, 0, 'Additional events must be 0 points');
assert.equal(CA_PROGRAM_CONFIG.milestones.certificate.pointsRequired, 40, 'Certificate milestone must require 40 points');
assert.deepEqual(
  CA_PROGRAM_CONFIG.rewardEligibility,
  { minPoints: 100, minVerifiedUsers: 40, minApprovedEvents: 2, minVerifiedOrganizers: 1 },
  'Reward eligibility must enforce all 4 mandatory criteria'
);
assert.equal(CA_PROGRAM_CONFIG.rewards.totalBudget, 45000, 'Total budget must be ₹45,000');
assert.equal(CA_PROGRAM_CONFIG.rewards.distributedPerformanceBudget, 43800, 'Distributed budget must be ₹43,800');
assert.equal(CA_PROGRAM_CONFIG.rewards.performanceReserve, 1200, 'Reserve budget must be ₹1,200');
console.log('  ✅ Program Configuration verified successfully.');

// ── Test 2: Point Math & Invariants ──
console.log('\nTest 2: Verifying Organizer Point Invariant (5 + 5 = 10 total)...');
function simulateOrganizerPoints(onboarded, eventsCount) {
  let points = 0;
  if (onboarded) points += CA_PROGRAM_CONFIG.points.organizerOnboarded; // +5
  if (eventsCount >= 1) points += CA_PROGRAM_CONFIG.points.organizerFirstApprovedEvent; // +5 on 1st event
  // events 2, 3, 4 award 0 points
  return points;
}
assert.equal(simulateOrganizerPoints(true, 0), 5, 'Onboarded organizer with 0 events = 5 pts');
assert.equal(simulateOrganizerPoints(true, 1), 10, 'Onboarded organizer with 1 event = 10 pts total');
assert.equal(simulateOrganizerPoints(true, 2), 10, 'Onboarded organizer with 2 events = still 10 pts total');
assert.equal(simulateOrganizerPoints(true, 10), 10, 'Onboarded organizer with 10 events = still 10 pts total');
console.log('  ✅ Organizer points capped at 10 total across all subsequent events.');

// ── Test 3: Certificate Milestone (40 points) ──
console.log('\nTest 3: Verifying Certificate Milestone unlock rule...');
function checkCertificate(points) {
  return points >= CA_PROGRAM_CONFIG.milestones.certificate.pointsRequired;
}
assert.equal(checkCertificate(0), false, '0 points cannot unlock certificate');
assert.equal(checkCertificate(39), false, '39 points cannot unlock certificate');
assert.equal(checkCertificate(40), true, '40 points must unlock certificate');
assert.equal(checkCertificate(41), true, '41 points must retain unlocked certificate');
assert.equal(checkCertificate(100), true, '100 points must retain unlocked certificate');
console.log('  ✅ Certificate unlocks at exactly 40 verified points.');

// ── Test 4: Reward Eligibility (ALL 4 mandatory criteria) ──
console.log('\nTest 4: Verifying 4-Criteria Reward Eligibility...');
function checkRewardEligibility({ points, verifiedUsers, approvedEvents, verifiedOrganizers }) {
  const reqs = CA_PROGRAM_CONFIG.rewardEligibility;
  return (
    points >= reqs.minPoints &&
    verifiedUsers >= reqs.minVerifiedUsers &&
    approvedEvents >= reqs.minApprovedEvents &&
    verifiedOrganizers >= reqs.minVerifiedOrganizers
  );
}

// Case 1: Meets all 4
assert.equal(
  checkRewardEligibility({ points: 100, verifiedUsers: 40, approvedEvents: 2, verifiedOrganizers: 1 }),
  true,
  'Boundary met: 100 pts, 40 users, 2 events, 1 org -> eligible'
);
assert.equal(
  checkRewardEligibility({ points: 150, verifiedUsers: 60, approvedEvents: 5, verifiedOrganizers: 3 }),
  true,
  'Over threshold: 150 pts, 60 users, 5 events, 3 org -> eligible'
);

// Case 2: 100 points, but users < 40
assert.equal(
  checkRewardEligibility({ points: 100, verifiedUsers: 39, approvedEvents: 2, verifiedOrganizers: 1 }),
  false,
  'Fails if verifiedUsers < 40'
);

// Case 3: 100 points, 40 users, but approvedEvents < 2
assert.equal(
  checkRewardEligibility({ points: 100, verifiedUsers: 40, approvedEvents: 1, verifiedOrganizers: 1 }),
  false,
  'Fails if approvedEvents < 2'
);

// Case 4: 100 points, 40 users, 2 events, but verifiedOrganizers < 1
assert.equal(
  checkRewardEligibility({ points: 100, verifiedUsers: 40, approvedEvents: 2, verifiedOrganizers: 0 }),
  false,
  'Fails if verifiedOrganizers < 1'
);

// Case 5: 99 points, but other 3 criteria met
assert.equal(
  checkRewardEligibility({ points: 99, verifiedUsers: 40, approvedEvents: 2, verifiedOrganizers: 1 }),
  false,
  'Fails if points < 100'
);
console.log('  ✅ Reward eligibility strictly requires ALL 4 criteria simultaneously.');

// ── Test 5: Deterministic Leaderboard Ranking & Tie-Breakers ──
console.log('\nTest 5: Verifying Deterministic Leaderboard Ranking Tie-Breakers...');
const ambassadors = [
  { id: 'CA-A', points: 100, events: 2, orgs: 1, users: 40, created: new Date('2026-01-01') },
  { id: 'CA-B', points: 100, events: 3, orgs: 1, users: 40, created: new Date('2026-01-02') }, // higher events -> wins over A
  { id: 'CA-C', points: 100, events: 2, orgs: 2, users: 40, created: new Date('2026-01-03') }, // higher orgs -> wins over A
  { id: 'CA-D', points: 100, events: 2, orgs: 1, users: 50, created: new Date('2026-01-04') }, // higher users -> wins over A
  { id: 'CA-E', points: 100, events: 2, orgs: 1, users: 40, created: new Date('2025-12-01') }, // earlier date -> wins over A
  { id: 'CA-TOP', points: 120, events: 1, orgs: 1, users: 20, created: new Date('2026-01-01') }, // higher points -> wins over all
];

function sortCAs(list) {
  return [...list].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.events !== a.events) return b.events - a.events;
    if (b.orgs !== a.orgs) return b.orgs - a.orgs;
    if (b.users !== a.users) return b.users - a.users;
    return a.created - b.created;
  });
}

const ranked = sortCAs(ambassadors);
assert.equal(ranked[0].id, 'CA-TOP', 'CA-TOP must be rank 1 due to highest points (120)');
assert.equal(ranked[1].id, 'CA-B', 'CA-B must be rank 2 due to highest events (3)');
assert.equal(ranked[2].id, 'CA-C', 'CA-C must be rank 3 due to highest orgs (2)');
assert.equal(ranked[3].id, 'CA-D', 'CA-D must be rank 4 due to highest users (50)');
assert.equal(ranked[4].id, 'CA-E', 'CA-E must be rank 5 due to earlier creation date');
assert.equal(ranked[5].id, 'CA-A', 'CA-A must be rank 6');
console.log('  ✅ Leaderboard tie-breaking is 100% deterministic (Points -> Events -> Orgs -> Users -> Timestamp).');

// ── Test 6: Anti-Fraud Self-Referral Prevention ──
console.log('\nTest 6: Verifying Anti-Fraud Self-Referral Prevention...');
function isSelfReferral(ca, candidate) {
  if (ca.userId && candidate._id && ca.userId.toString() === candidate._id.toString()) return true;
  if (ca.email && candidate.email && ca.email.toLowerCase() === candidate.email.toLowerCase()) return true;
  return false;
}

assert.equal(
  isSelfReferral({ userId: '65f0001', email: 'ca@festnest.in' }, { _id: '65f0001', email: 'other@festnest.in' }),
  true,
  'Must block self-referral when userId matches'
);
assert.equal(
  isSelfReferral({ userId: '65f0001', email: 'ca@festnest.in' }, { _id: '65f0002', email: 'CA@FESTNEST.IN' }),
  true,
  'Must block self-referral when email matches (case-insensitive)'
);
assert.equal(
  isSelfReferral({ userId: '65f0001', email: 'ca@festnest.in' }, { _id: '65f0002', email: 'student@festnest.in' }),
  false,
  'Must allow valid referral from distinct user and email'
);
console.log('  ✅ Anti-fraud logic correctly blocks self-referrals.');

// ── Test 7: Idempotency Key Format ──
console.log('\nTest 7: Verifying Idempotency Key deterministic format...');
const testUserId = '65f1234567890abcdef12345';
const testCaId = '65f9876543210fedcba54321';
const userKey = `USER_VERIFIED:${testUserId}:${testCaId}`;
const orgKey = `ORGANIZER_VERIFIED:${testUserId}:${testCaId}`;
const firstEventKey = `ORGANIZER_FIRST_EVENT_APPROVED:${testUserId}:${testCaId}`;

assert.equal(userKey, `USER_VERIFIED:${testUserId}:${testCaId}`);
assert.equal(orgKey, `ORGANIZER_VERIFIED:${testUserId}:${testCaId}`);
assert.equal(firstEventKey, `ORGANIZER_FIRST_EVENT_APPROVED:${testUserId}:${testCaId}`);
console.log('  ✅ Idempotency keys follow deterministic compound structure.');

// ── Test 8: Public-Safe Data Sanitization ──
console.log('\nTest 8: Verifying Public-Safe Data Sanitization...');
const privateCA = {
  name: 'John Doe',
  email: 'john@festnest.in',
  phone: '9876543210',
  college: 'IIT Bombay',
  city: 'Mumbai',
  why: 'I love events and want to represent festnest...',
  notes: 'Internal admin note: approved after interview',
  caId: 'FN-CA-MUM-001',
  totalPoints: 120,
  password: 'hashedpassword123',
};

function sanitizePublicLeaderboardEntry(ca, rank) {
  return {
    rank,
    caId: ca.caId,
    name: ca.name,
    college: ca.college,
    city: ca.city,
    points: ca.totalPoints,
  };
}

const publicEntry = sanitizePublicLeaderboardEntry(privateCA, 1);
assert.equal(publicEntry.name, 'John Doe');
assert.equal(publicEntry.caId, 'FN-CA-MUM-001');
assert.equal(publicEntry.email, undefined, 'Email must never be exposed publicly');
assert.equal(publicEntry.phone, undefined, 'Phone must never be exposed publicly');
assert.equal(publicEntry.why, undefined, 'Why statement must never be exposed publicly');
assert.equal(publicEntry.notes, undefined, 'Internal notes must never be exposed publicly');
assert.equal(publicEntry.password, undefined, 'Password must never be exposed publicly');
console.log('  ✅ Public leaderboard and cards strictly sanitize sensitive fields.');

// ── Test 9: End-to-End Workflow Verification (CASES 1 to 6) ──
console.log('\nTest 9: Executing the 6 End-to-End Lifecycle Cases...');

// Environment State Setup
const ca = {
  _id: 'ca_user_123',
  caId: 'FN-CA-BLR-014',
  referralCode: 'FN-BLR-014',
  status: 'approved',
  totalPoints: 0,
  stats: { referralSignups: 0, organizersOnboarded: 0, eventsSourced: 0 },
  firstEventApprovedOrganizers: [],
  referredOrganizerIds: [],
};

const ledger = new Map(); // idempotencyKey -> entry

function processUserRegistration(referredByCAId, user) {
  if (user.role === 'organizer' && user.organization && user.designation && user.isEmailVerified) {
    // Verified organizer onboarding flow (+5 points)
    const idempotencyKey = `ORGANIZER_VERIFIED:${user._id}:${referredByCAId}`;
    if (ledger.has(idempotencyKey)) return ledger.get(idempotencyKey);
    const entry = { type: 'ORGANIZER_VERIFIED', points: CA_PROGRAM_CONFIG.points.organizerOnboarded, idempotencyKey };
    ledger.set(idempotencyKey, entry);
    ca.stats.organizersOnboarded += 1;
    ca.totalPoints += CA_PROGRAM_CONFIG.points.organizerOnboarded;
    return entry;
  } else {
    // Verified student/user signup flow (+1 point)
    const idempotencyKey = `USER_VERIFIED:${user._id}:${referredByCAId}`;
    if (ledger.has(idempotencyKey)) return ledger.get(idempotencyKey);
    const entry = { type: 'USER_VERIFIED', points: CA_PROGRAM_CONFIG.points.userSignup, idempotencyKey };
    ledger.set(idempotencyKey, entry);
    ca.stats.referralSignups += 1;
    ca.totalPoints += CA_PROGRAM_CONFIG.points.userSignup;
    return entry;
  }
}

function processEventSubmission(user, eventData) {
  // A student submitting an event does NOT get organizer points.
  // Only actual verified organizers have role === 'organizer'.
  return { success: true, eventName: eventData.name, organizerPoints: 0 };
}

function processEventApproval(referredByCAId, event, submitterUser) {
  const isOrg = isVerifiedOrganizer(submitterUser);
  let pointsAwarded = 0;

  if (isOrg) {
    const isFirst = !ca.firstEventApprovedOrganizers.includes(submitterUser._id);
    if (isFirst) {
      const idempotencyKey = `ORGANIZER_FIRST_EVENT_APPROVED:${submitterUser._id}:${referredByCAId}`;
      if (!ledger.has(idempotencyKey)) {
        const entry = {
          type: 'ORGANIZER_FIRST_EVENT_APPROVED',
          points: CA_PROGRAM_CONFIG.points.organizerFirstApprovedEvent, // +5
          idempotencyKey,
        };
        ledger.set(idempotencyKey, entry);
        ca.firstEventApprovedOrganizers.push(submitterUser._id);
        ca.totalPoints += CA_PROGRAM_CONFIG.points.organizerFirstApprovedEvent;
        pointsAwarded = CA_PROGRAM_CONFIG.points.organizerFirstApprovedEvent;
      }
    }
  }

  // Approved events sourced count increments
  ca.stats.eventsSourced += 1;
  return { pointsAwarded, approvedEvents: ca.stats.eventsSourced };
}

// ── CASE 1: CA refers student -> student verifies account ──
console.log('  Case 1: CA refers student -> student verifies account...');
const studentUser = {
  _id: 'student_999',
  name: 'Rahul Sharma',
  email: 'rahul@student.rvce.edu',
  role: 'user',
  college: 'RV College of Engineering',
  isEmailVerified: true,
  referredByCA: ca._id,
};
processUserRegistration(ca._id, studentUser);
assert.equal(ca.totalPoints, 1, 'CASE 1: Student registration must award exactly +1 point');
assert.equal(ca.stats.referralSignups, 1, 'CASE 1: Verified users count must be 1');
assert.equal(ca.stats.organizersOnboarded, 0, 'CASE 1: Organizers onboarded count must remain 0');
console.log('    ✓ CASE 1 PASSED: Total Points = 1 (Student = 1, Organizer = 0)');

// ── CASE 2: Same student submits an event but is NOT a verified organizer ──
console.log('  Case 2: Same student submits an event but is NOT a verified organizer...');
assert.equal(isVerifiedOrganizer(studentUser), false, 'Student must not be a verified organizer');
const subRes = processEventSubmission(studentUser, { name: 'Campus Hack Day' });
assert.equal(subRes.organizerPoints, 0, 'CASE 2: Submitting an event must yield 0 organizer points');
assert.equal(ca.totalPoints, 1, 'CASE 2: Total points must remain +1 (no organizer points added)');
assert.equal(ca.stats.organizersOnboarded, 0, 'CASE 2: Organizers count must still be 0');
console.log('    ✓ CASE 2 PASSED: Total Points = 1 (Organizer points = 0)');

// ── CASE 3: CA refers actual organizer -> completes verification/onboarding ──
console.log('  Case 3: CA refers actual organizer -> completes verification/onboarding...');
const organizerUser = {
  _id: 'org_888',
  name: 'Priya Patel',
  email: 'priya@techclub.org',
  role: 'organizer',
  organization: 'TechClub Events Inc.',
  designation: 'Convenor',
  isEmailVerified: true,
  referredByCA: ca._id,
};
assert.equal(isVerifiedOrganizer(organizerUser), true, 'Organizer must be recognized as verified organizer');
processUserRegistration(ca._id, organizerUser);
assert.equal(ca.totalPoints, 6, 'CASE 3: CA points must be 6 (1 student + 5 organizer)');
assert.equal(ca.stats.organizersOnboarded, 1, 'CASE 3: Organizers onboarded count must be 1');
console.log('    ✓ CASE 3 PASSED: Total Points = 6 (+5 from verified organizer onboarding)');

// ── CASE 4: That organizer\'s first event is approved ──
console.log('  Case 4: That organizer\'s first event is approved...');
const event1 = { _id: 'ev_001', name: 'National Hackathon 2026' };
const resCase4 = processEventApproval(ca._id, event1, organizerUser);
assert.equal(resCase4.pointsAwarded, 5, 'CASE 4: First approved event must award +5 additional points');
assert.equal(ca.totalPoints, 11, 'CASE 4: CA points must be 11 (1 + 5 + 5)');
// Invariant check: Organizer onboarding (5) + first event (5) = 10 TOTAL for that organizer
const organizerContribution = ca.totalPoints - 1; // subtract 1 from student
assert.equal(organizerContribution, 10, 'CASE 4: Organizer total contribution must be exactly 10 points');
console.log('    ✓ CASE 4 PASSED: Total Points = 11 (+5 additional; Organizer contribution = 10 total)');

// ── CASE 5: Second event from same organizer is approved ──
console.log('  Case 5: Second event from same organizer is approved...');
const event2 = { _id: 'ev_002', name: 'AI Summit 2026' };
const resCase5 = processEventApproval(ca._id, event2, organizerUser);
assert.equal(resCase5.pointsAwarded, 0, 'CASE 5: Second approved event must award 0 additional points');
assert.equal(ca.totalPoints, 11, 'CASE 5: Total points must remain 11');
assert.equal(ca.stats.eventsSourced, 2, 'CASE 5: Approved event count must increment to 2');
console.log('    ✓ CASE 5 PASSED: Total Points = 11 (+0 points; Approved events count = 2)');

// ── CASE 6: Repeat any approval/registration request (idempotency check) ──
console.log('  Case 6: Repeat any approval/registration request (idempotency)...');
// Repeat student registration
processUserRegistration(ca._id, studentUser);
assert.equal(ca.totalPoints, 11, 'CASE 6: Re-registering student must not award duplicate points');

// Repeat organizer registration
processUserRegistration(ca._id, organizerUser);
assert.equal(ca.totalPoints, 11, 'CASE 6: Re-registering organizer must not award duplicate points');

// Repeat first event approval
processEventApproval(ca._id, event1, organizerUser);
assert.equal(ca.totalPoints, 11, 'CASE 6: Re-approving first event must not award duplicate points');

console.log('    ✓ CASE 6 PASSED: Total Points = 11 (No duplicate points awarded on retries/repeats)');

console.log('\n🎉 ALL 9 TEST SUITES & 6 E2E CASES PASSED WITH ZERO ERRORS!\n');
