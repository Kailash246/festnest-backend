// routes/support.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { getFaqs, submitTicket, myTickets, reopenTicket, addReply } from '../controllers/supportController.js';

const router = Router();
router.get('/faqs',                    getFaqs);
router.post('/contact',   optionalAuth, submitTicket);
router.get('/tickets',    requireAuth,  myTickets);
router.patch('/tickets/:id/reopen', requireAuth, reopenTicket);
router.post('/tickets/:id/reply',   requireAuth, addReply);

export default router;
