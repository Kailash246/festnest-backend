// routes/auth.js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import {
  sendOtp, register, login, loginWithOtp,
  refresh, logout, logoutAll,
  forgotPassword, resetPassword, getMe,
} from '../controllers/authController.js';

const router = Router();

// Stricter limiter for password-reset requests: 5 per 15 min per IP
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});

router.post('/send-otp',        sendOtp);
router.post('/register',        register);
router.post('/login',           login);
router.post('/login-otp',       loginWithOtp);
router.post('/refresh',         refresh);
router.post('/logout',          logout);
router.post('/logout-all',      requireAuth, logoutAll);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password',  resetPassword);
router.get('/me',               requireAuth, getMe);

export default router;
