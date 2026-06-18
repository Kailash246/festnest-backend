// routes/auth.js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import {
  sendOtp, register, login, loginWithOtp,
  refresh, logout, logoutAll,
  forgotPassword, resetPassword, getMe,
} from '../controllers/authController.js';
import {
  validate,
  validateSendOtp,
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
} from '../middleware/validate.js';

const router = Router();

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});

router.post('/send-otp',        ...validateSendOtp,       validate, sendOtp);
router.post('/register',        ...validateRegister,       validate, register);
router.post('/login',           ...validateLogin,          validate, login);
router.post('/login-otp',       loginWithOtp);
router.post('/refresh',         refresh);
router.post('/logout',          logout);
router.post('/logout-all',      requireAuth, logoutAll);
router.post('/forgot-password', forgotPasswordLimiter, ...validateForgotPassword, validate, forgotPassword);
router.post('/reset-password',  ...validateResetPassword,  validate, resetPassword);
router.get('/me',               requireAuth, getMe);

export default router;
