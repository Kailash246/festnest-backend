// routes/ca.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { apply, getMyProfile, getPublicCard, getMyImpact, getCAImpact } from '../controllers/caController.js';

const router = Router();

/* ── Public Application Submission (attaches user if logged in) ── */
router.post('/apply', optionalAuth, apply);

/* ── Ambassador Portal: Profile, Status, & Live Derived Stats ── */
router.get('/me', requireAuth, getMyProfile);

/* ── Ambassador Portal: Activity / Impact Ledger (Self-scoped) ── */
router.get('/me/impact', requireAuth, getMyImpact);

/* ── Admin-Protected: Ambassador Impact Ledger (by CA ID) ── */
router.get('/:id/impact', requireAdmin, getCAImpact);

/* ── Public-Safe ID Card Verification Endpoint ── */
router.get('/card/:caId', getPublicCard);

export default router;
