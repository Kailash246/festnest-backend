// routes/refer.js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../middleware/adminAuth.js';
import {
  getReferralSummary,
  getReferralHistory,
  getWheelConfig,
  spinWheel,
} from '../controllers/referController.js';

const router = Router();

// Strictly restrict entire Refer & Earn API to admin users
router.use(requireAdmin);

/* ── Rate limiter for spin requests (prevent rapid automated spin requests) ── */
const spinLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMIT',
    message: 'Too many spin requests. Please wait a moment.',
  },
});

/* ── Admin-only Refer & Earn routes ── */
router.get('/summary',      getReferralSummary);
router.get('/history',      getReferralHistory);
router.get('/wheel-config', getWheelConfig);
router.post('/spin',        spinLimiter, spinWheel);

export default router;

