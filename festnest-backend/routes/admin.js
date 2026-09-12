// routes/admin.js
import { Router } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middleware/adminAuth.js';
import {
  getDashboardStats,
  listSubmissions, getSubmission, approveSubmission, rejectSubmission,
  listAllEvents, createEvent, updateEvent, deleteEvent, restoreEvent, permanentDeleteEvent,
  featureEvent,
  listUsers, getUser, toggleBanUser, setUserRole, adjustUserPoints,
  listTickets, updateTicket,
  addCollege, updateCollege, deleteCollege,
  broadcastNotification,
  listAmbassadors, getAmbassador, approveAmbassador, rejectAmbassador,
  updateAmbassadorStatus, adjustAmbassadorStats, getAmbassadorImpact,
  listFeedback, getFeedback, deleteFeedback,
} from '../controllers/adminController.js';
import {
  getAdminReferStats,
  listAdminReferrals,
  getAdminReferralDetail,
  getAdminUserReferProfile,
  listAdminLedger,
  grantAdminTestCoins,
  resetAdminTestCoins,
  adjustUserCoins,
  adjustUserBonusSpins,
  adminTestSpin,
  invalidateReferral,
  restoreReferral,
  verifyReferralRegistration,
  unverifyReferralRegistration,
  overrideReferralState,
  listAdminRewards,
  createAdminReward,
  updateAdminReward,
  deleteAdminReward,
  listAdminSpins,
  updateAdminSpinStatus,
  getAdminReferSettings,
  updateAdminReferSettings,
} from '../controllers/referController.js';
import {
  validate, validateAdminCreateEvent, validateAdjustPoints,
  validateAddCollege, validateBroadcast,
} from '../middleware/validate.js';

const router = Router();

// All admin routes require at minimum admin role
router.use(requireAdmin);

/* ── Dashboard ── */
router.get('/stats', getDashboardStats);

/* ── Hosted Event Submissions (approval system) ── */
router.get('/submissions',            listSubmissions);
router.get('/submissions/:id',        getSubmission);
router.post('/submissions/:id/approve', approveSubmission);
router.post('/submissions/:id/reject',  rejectSubmission);

/* ── Live Event Management ── */
router.get('/events',          listAllEvents);
router.post('/events',         ...validateAdminCreateEvent, validate, createEvent);
router.patch('/events/:id',    updateEvent);
router.delete('/events/:id',   deleteEvent);
router.patch('/events/:id/restore',    restoreEvent);
router.patch('/events/:id/feature',    requireSuperAdmin, featureEvent);
router.delete('/events/:id/permanent', requireSuperAdmin, permanentDeleteEvent);

/* ── User Management ── */
router.get('/users',                  listUsers);
router.get('/users/:id',              getUser);
router.patch('/users/:id/ban',        toggleBanUser);
router.patch('/users/:id/points',     ...validateAdjustPoints, validate, adjustUserPoints);
// Role change is superadmin-only
router.patch('/users/:id/role',       requireSuperAdmin, setUserRole);

/* ── Support Tickets ── */
router.get('/tickets',       listTickets);
router.patch('/tickets/:id', updateTicket);

/* ── College Management ── */
router.post('/colleges',         ...validateAddCollege, validate, addCollege);
router.patch('/colleges/:id',    updateCollege);
router.delete('/colleges/:id',   deleteCollege);

/* ── Broadcast Notifications ── */
router.post('/notify', ...validateBroadcast, validate, broadcastNotification);

/* ── Campus Ambassadors ── */
router.get('/ca',               listAmbassadors);
router.get('/ca/:id',           getAmbassador);
router.get('/ca/:id/impact',    getAmbassadorImpact);
router.patch('/ca/:id/approve', approveAmbassador);
router.patch('/ca/:id/reject',  rejectAmbassador);
router.patch('/ca/:id/status',  updateAmbassadorStatus);
router.patch('/ca/:id/adjust',  adjustAmbassadorStats);

/* ── User Feedback ── */
router.get('/feedback',         listFeedback);
router.get('/feedback/:id',     getFeedback);
router.delete('/feedback/:id',  deleteFeedback);

/* ── Refer & Earn + FN Coins + Spin Wheel ── */
// Stats & Overview
router.get('/refer/stats',                              getAdminReferStats);

// Referrals
router.get('/refer/referrals',                          listAdminReferrals);
router.get('/refer/referrals/:id',                      getAdminReferralDetail);
router.post('/refer/referrals/:id/invalidate',          invalidateReferral);
router.post('/refer/referrals/:id/restore',             restoreReferral);
router.post('/refer/referrals/:id/verify-registration', verifyReferralRegistration);
router.post('/refer/referrals/:id/unverify-registration', unverifyReferralRegistration);
router.patch('/refer/referrals/:id/override',           overrideReferralState);

// User Refer Profile & Operations
router.get('/refer/users/:id',                          getAdminUserReferProfile);
router.post('/refer/users/:id/adjust-coins',            adjustUserCoins);
router.post('/refer/users/:id/bonus-spins',             adjustUserBonusSpins);

// Ledger
router.get('/refer/ledger',                             listAdminLedger);

// Admin Self-Testing & Diagnostic Tools
router.post('/refer/test/grant-coins',                  grantAdminTestCoins);
router.post('/refer/test/reset-coins',                  resetAdminTestCoins);
router.post('/refer/test/spin',                         adminTestSpin);

// Reward Wheel Config Management
router.get('/refer/rewards',                            listAdminRewards);
router.post('/refer/rewards',                           createAdminReward);
router.patch('/refer/rewards/:id',                      updateAdminReward);
router.delete('/refer/rewards/:id',                     deleteAdminReward);

// Spins & Cash Payouts
router.get('/refer/spins',                              listAdminSpins);
router.patch('/refer/spins/:id/status',                 updateAdminSpinStatus);

// Program Rules & Configuration
router.get('/refer/settings',                           getAdminReferSettings);
router.patch('/refer/settings',                         updateAdminReferSettings);

export default router;

