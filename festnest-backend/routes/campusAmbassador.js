// routes/campusAmbassador.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { uploadCAPhoto } from '../config/cloudinary.js';
import {
  apply,
  listApplications,
  approveApplication,
  rejectApplication,
  getMyProfile,
  getPublicCard,
} from '../controllers/caController.js';

const router = Router();

/* ── Public Application Submission (optional photo upload) ── */
router.post('/apply', uploadCAPhoto, optionalAuth, apply);

/* ── Admin-Protected Applications Review ── */
router.get('/applications', requireAdmin, listApplications);
router.post('/:id/approve', requireAdmin, approveApplication);
router.patch('/:id/approve', requireAdmin, approveApplication);
router.post('/:id/reject',  requireAdmin, rejectApplication);
router.patch('/:id/reject',  requireAdmin, rejectApplication);

/* ── Auth-Protected Ambassador Profile ── */
router.get('/me', requireAuth, getMyProfile);

/* ── Public-Safe ID Card Verification ── */
router.get('/card/:caId', getPublicCard);

export default router;

