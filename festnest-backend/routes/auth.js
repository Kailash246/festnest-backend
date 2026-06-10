// routes/auth.js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  sendOtp, register, login, loginWithOtp,
  refresh, logout, logoutAll,
  forgotPassword, resetPassword, getMe,
} from '../controllers/authController.js';

const router = Router();

router.post('/send-otp',        sendOtp);
router.post('/register',        register);
router.post('/login',           login);
router.post('/login-otp',       loginWithOtp);
router.post('/refresh',         refresh);
router.post('/logout',          logout);
router.post('/logout-all',      requireAuth, logoutAll);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);
router.get('/me',               requireAuth, getMe);

export default router;
