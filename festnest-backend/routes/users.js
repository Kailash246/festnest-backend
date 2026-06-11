// routes/users.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadAvatar as uploadAvatarStorage } from '../config/cloudinary.js';
import {
  getMe, updateMe, uploadAvatar, changePassword,
  myRegistrations, myPoints, myHostedEvents,
} from '../controllers/usersController.js';

const router = Router();

router.get('/me',                requireAuth, getMe);
router.patch('/me',              requireAuth, updateMe);
router.post('/me/avatar',        requireAuth, uploadAvatarStorage, uploadAvatar);
router.patch('/me/password',     requireAuth, changePassword);
router.get('/me/registrations',  requireAuth, myRegistrations);
router.get('/me/points',         requireAuth, myPoints);
router.get('/me/hosted',         requireAuth, myHostedEvents);

export default router;
