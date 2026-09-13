// routes/activity.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  startSession,
  heartbeat,
  pageView,
  trackActivity,
  endSession,
} from '../controllers/activityController.js';

const router = Router();

// All activity routes require authentication
router.use(requireAuth);

router.post('/session/start', startSession);
router.post('/heartbeat',     heartbeat);
router.post('/page-view',     pageView);
router.post('/track',         trackActivity);
router.post('/session/end',   endSession);

export default router;
