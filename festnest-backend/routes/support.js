// routes/support.js
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { getFaqs, submitTicket, myTickets, reopenTicket, addReply } from '../controllers/supportController.js';
import { validate, validateSubmitTicket, validateTicketReply } from '../middleware/validate.js';

const router = Router();

router.get('/faqs',                    getFaqs);
router.post('/contact',   optionalAuth, ...validateSubmitTicket,  validate, submitTicket);
router.get('/tickets',    requireAuth,  myTickets);
router.patch('/tickets/:id/reopen', requireAuth, ...validateTicketReply, validate, reopenTicket);
router.post('/tickets/:id/reply',   requireAuth, ...validateTicketReply, validate, addReply);

export default router;
