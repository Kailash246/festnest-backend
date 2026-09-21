// config/caProgramConfig.js
// Canonical single-source-of-truth configuration for the FestNest Campus Ambassador Program

export const CA_PROGRAM_CONFIG = {
  // Base benefits awarded immediately to all approved CAs (0 points required)
  baseBenefits: [
    {
      id: 'official_id',
      title: 'Official FestNest Campus Ambassador ID',
      description: 'Verified digital credential with unique CA number, valid thru date, and scannable verification.',
      status: 'unlocked',
    },
    {
      id: 'verified_profile',
      title: 'Verified CA Profile',
      description: 'Official identity badge and campus association within the FestNest platform.',
      status: 'unlocked',
    },
    {
      id: 'referral_code',
      title: 'Personal Referral Link & Code',
      description: 'Dedicated attribution tracking for student discovery, organizer onboarding, and event sourcing.',
      status: 'unlocked',
    },
    {
      id: 'portal_access',
      title: 'CA Portal Access',
      description: 'Live performance metrics, real-time attribution ledger, and leaderboard analytics.',
      status: 'unlocked',
    },
    {
      id: 'community_access',
      title: 'FestNest CA Community',
      description: 'Direct access to national ambassador network, official announcements, and mentor support.',
      status: 'unlocked',
    },
    {
      id: 'official_recognition',
      title: 'Official CA Recognition',
      description: 'Verified ambassador status to display on LinkedIn, resume, and professional profiles.',
      status: 'unlocked',
    },
  ],

  // Point scoring rules
  points: {
    userSignup: 1,                    // Verified student/user signup
    organizerOnboarded: 5,            // Verified organizer onboarded
    organizerFirstApprovedEvent: 5,   // Bonus on first approved event -> 10 points TOTAL for organizer
    organizerTotalWithFirstEvent: 10, // Explicit total invariant check: 5 + 5 = 10
    organizerAdditionalEvents: 0,     // Additional events by same organizer award 0 additional points
  },

  // Milestones
  milestones: {
    certificate: {
      pointsRequired: 40,
      name: 'Official Program Certificate',
      description: 'Unlocked automatically once reaching 40 verified points.',
    },
  },

  // Mandatory criteria for reward eligibility (ALL 4 required)
  rewardEligibility: {
    minPoints: 100,
    minVerifiedUsers: 40,
    minApprovedEvents: 2,
    minVerifiedOrganizers: 1,
  },

  // Performance status labels
  statuses: {
    GETTING_STARTED: 'Getting Started',                         // 0 - 39 points
    CERTIFICATE_ACHIEVED: 'Certificate Milestone Achieved',      // 40 - 99 points
    REWARD_ELIGIBLE: 'Reward Eligible',                         // 100+ points & all 4 criteria met
    TOP_PERFORMER: 'Top Performer',                             // Top 10 leaderboard & reward eligible
  },

  // Reward pool breakdown
  rewards: {
    totalBudget: 45000,
    distributedPerformanceBudget: 43800,
    performanceReserve: 1200,
    monthly: {
      totalPerMonth: 2800,
      months: 6,
      totalSixMonths: 16800,
      ranks: [
        { rank: 1, amount: 1500, label: '1st Place' },
        { rank: 2, amount: 800, label: '2nd Place' },
        { rank: 3, amount: 500, label: '3rd Place' },
      ],
    },
    final: {
      total: 27000,
      ranks: [
        { rank: 1, amount: 8000, label: '1st Place' },
        { rank: 2, amount: 5000, label: '2nd Place' },
        { rank: 3, amount: 3500, label: '3rd Place' },
        { rank: 4, amount: 2500, label: '4th Place' },
        { rank: 5, amount: 2000, label: '5th Place' },
        { rank: 6, amount: 1200, label: '6th Place' },
        { rank: 7, amount: 1200, label: '7th Place' },
        { rank: 8, amount: 1200, label: '8th Place' },
        { rank: 9, amount: 1200, label: '9th Place' },
        { rank: 10, amount: 1200, label: '10th Place' },
      ],
    },
  },
};

export default CA_PROGRAM_CONFIG;

