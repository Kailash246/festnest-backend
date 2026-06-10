// routes/admin.js
import { Router } from 'express';
import { requireAdmin, requireSuperAdmin } from '../middleware/adminAuth.js';
import {
  getDashboardStats,
  listSubmissions, getSubmission, approveSubmission, rejectSubmission,
  listAllEvents, createEvent, updateEvent, deleteEvent, restoreEvent, permanentDeleteEvent,
  featureEvent,
  listUsers, getUser, toggleBanUser, setUserRole, adjustUserPoints,
  listTickets, updateTicket,
  addCollege, updateCollege, deleteCollege,
  broadcastNotification,
} from '../controllers/adminController.js';

const router = Router();

// All admin routes require at minimum admin role
router.use(requireAdmin);

/* ── Dashboard ── */
router.get('/stats', getDashboardStats);

/* ── Hosted Event Submissions (approval system) ── */
router.get('/submissions',            listSubmissions);
router.get('/submissions/:id',        getSubmission);
router.post('/submissions/:id/approve', approveSubmission);
router.post('/submissions/:id/reject',  rejectSubmission);

/* ── Live Event Management ── */
router.get('/events',          listAllEvents);
router.post('/events',         createEvent);
router.patch('/events/:id',    updateEvent);
router.delete('/events/:id',   deleteEvent);
router.patch('/events/:id/restore',    restoreEvent);
router.patch('/events/:id/feature',    requireSuperAdmin, featureEvent);
router.delete('/events/:id/permanent', requireSuperAdmin, permanentDeleteEvent);

/* ── User Management ── */
router.get('/users',                  listUsers);
router.get('/users/:id',              getUser);
router.patch('/users/:id/ban',        toggleBanUser);
router.patch('/users/:id/points',     adjustUserPoints);
// Role change is superadmin-only
router.patch('/users/:id/role',       requireSuperAdmin, setUserRole);

/* ── Support Tickets ── */
router.get('/tickets',       listTickets);
router.patch('/tickets/:id', updateTicket);

/* ── College Management ── */
router.post('/colleges',         addCollege);
router.patch('/colleges/:id',    updateCollege);
router.delete('/colleges/:id',   deleteCollege);

/* ── Broadcast Notifications ── */
router.post('/notify', broadcastNotification);

export default router;
