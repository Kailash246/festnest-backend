// routes/events.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { uploadEventFiles } from '../config/cloudinary.js';
import {
  listEvents, trendingEvents, urgentEvents, featuredEvents, savedEvents,
  getEvent, saveEvent, unsaveEvent,
  registerForEvent, cancelRegistration, hostEvent,
} from '../controllers/eventsController.js';

const router = Router();

router.get('/',              optionalAuth, listEvents);
router.get('/trending',      trendingEvents);
router.get('/urgent',        urgentEvents);
router.get('/featured',      featuredEvents);
router.get('/saved',         requireAuth, savedEvents);
router.get('/:slug',         optionalAuth, getEvent);

router.post('/:slug/save',      requireAuth, saveEvent);
router.delete('/:slug/save',    requireAuth, unsaveEvent);
router.post('/:slug/register',  requireAuth, registerForEvent);
router.delete('/:slug/register',requireAuth, cancelRegistration);

// Host event — handles bannerImage (image) and brochure (PDF) in one middleware pass
router.post('/host', requireAuth, uploadEventFiles, hostEvent);

export default router;
