// routes/ca.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { apply, getMyProfile, getPublicCard } from '../controllers/caController.js';

const router = Router();

/* ── Public Application Submission (attaches user if logged in) ── */
router.post('/apply', optionalAuth, apply);

/* ── Ambassador Portal: Profile, Status, & Live Derived Stats ── */
router.get('/me', requireAuth, getMyProfile);

/* ── Public-Safe ID Card Verification Endpoint ── */
router.get('/card/:caId', getPublicCard);

export default router;

