// routes/refer.js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  getReferralSummary,
  getReferralHistory,
  getWheelConfig,
  spinWheel,
} from '../controllers/referController.js';

const router = Router();

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

/* ── User routes ── */
router.get('/summary',      requireAuth, getReferralSummary);
router.get('/history',      requireAuth, getReferralHistory);
router.get('/wheel-config', optionalAuth, getWheelConfig);
router.post('/spin',        requireAuth, spinLimiter, spinWheel);

export default router;

