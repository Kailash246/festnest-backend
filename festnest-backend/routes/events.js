// routes/events.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { uploadEventFiles } from '../config/cloudinary.js';
import {
  listEvents, trendingEvents, urgentEvents, featuredEvents, savedEvents,
  getEvent, saveEvent, unsaveEvent,
  registerForEvent, cancelRegistration, hostEvent, getEventStats,
  addCompetition, updateCompetition, deleteCompetition,
} from '../controllers/eventsController.js';
import { validate, validateHostEvent } from '../middleware/validate.js';

const router = Router();

router.get('/',              optionalAuth, listEvents);
router.get('/trending',      trendingEvents);
router.get('/urgent',        urgentEvents);
router.get('/featured',      featuredEvents);
router.get('/saved',         requireAuth, savedEvents);
router.get('/stats',         getEventStats);
router.get('/:slug',         optionalAuth, getEvent);

router.post('/:slug/save',      requireAuth, saveEvent);
router.delete('/:slug/save',    requireAuth, unsaveEvent);
router.post('/:slug/register',  requireAuth, registerForEvent);
router.delete('/:slug/register',requireAuth, cancelRegistration);

router.post('/:slug/competitions', requireAuth, addCompetition);
router.patch('/:slug/competitions/:competitionId', requireAuth, updateCompetition);
router.delete('/:slug/competitions/:competitionId', requireAuth, deleteCompetition);

// Host event — multipart upload then validation (body fields come from FormData)
router.post('/host', requireAuth, uploadEventFiles, ...validateHostEvent, validate, hostEvent);

export default router;
