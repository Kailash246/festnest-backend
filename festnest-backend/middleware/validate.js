// middleware/validate.js — centralized express-validator chains
import { body, validationResult } from 'express-validator';
import { fail } from '../utils/response.js';

const PHONE_RE  = /^[+\d][\d\s\-().]{5,18}$/;
const URL_OPTS  = { require_protocol: true, protocols: ['http', 'https'] };

/* Run after a chain and short-circuit on first error */
export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errs = errors.array().map(e => ({ field: e.path, message: e.msg }));
    return fail(res, errs[0].message, 400, errs);
  }
  next();
}

/* ── Auth ─────────────────────────────────────────────── */
export const validateSendOtp = [
  body('email').trim().isEmail().withMessage('A valid email address is required'),
];

export const validateRegister = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name must not exceed 100 characters'),
  body('email')
    .trim()
    .isEmail().withMessage('A valid email address is required'),
  body('otp')
    .notEmpty().withMessage('OTP is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  // Organization & designation are required only when registering as an organizer.
  body('organization')
    .if(body('role').equals('organizer'))
    .trim()
    .notEmpty().withMessage('Organization / College name is required')
    .isLength({ min: 2, max: 150 }).withMessage('Organization must be between 2 and 150 characters'),
  body('designation')
    .if(body('role').equals('organizer'))
    .trim()
    .notEmpty().withMessage('Designation is required')
    .isLength({ min: 2, max: 100 }).withMessage('Designation must be between 2 and 100 characters'),
];

export const validateLogin = [
  body('email').trim().notEmpty().withMessage('Email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const validateForgotPassword = [
  body('email').trim().isEmail().withMessage('A valid email address is required'),
];

export const validateResetPassword = [
  body('email').trim().isEmail().withMessage('A valid email address is required'),
  body('otp').notEmpty().withMessage('OTP is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

/* ── Events ───────────────────────────────────────────── */
export const validateHostEvent = [
  body('eventName')
    .trim()
    .notEmpty().withMessage('Event title is required')
    .isLength({ max: 100 }).withMessage('Event title must not exceed 100 characters'),
  body('about')
    .optional()
    .isLength({ max: 5000 }).withMessage('Description must not exceed 5000 characters'),
  body('city')
    .optional()
    .isLength({ max: 200 }).withMessage('Location must not exceed 200 characters'),
  body('college')
    .optional()
    .isLength({ max: 100 }).withMessage('Organizer name must not exceed 100 characters'),
  body('pocName')
    .optional({ checkFalsy: true })
    .isLength({ max: 100 }).withMessage('Contact name must not exceed 100 characters'),
  body('totalPrize')
    .optional({ checkFalsy: true })
    .custom(v => !isNaN(Number(String(v).replace(/,/g, ''))) && Number(String(v).replace(/,/g, '')) >= 0)
    .withMessage('Prize pool must be a non-negative number'),
  body('entryFee')
    .optional({ checkFalsy: true })
    .custom(v => {
      const clean = String(v).trim();
      if (!clean || clean.toLowerCase() === 'free') return true;
      const n = Number(clean.replace(/,/g, ''));
      return !isNaN(n) && n >= 0;
    })
    .withMessage('Registration fee must be a non-negative number or "Free"'),
  body('pocPhone')
    .optional({ checkFalsy: true })
    .matches(PHONE_RE)
    .withMessage('Invalid phone number format'),
  body('pocEmail')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Invalid contact email format'),
  body('website')
    .optional({ checkFalsy: true })
    .isURL(URL_OPTS)
    .withMessage('Website must be a valid URL (include https://)'),
  body('registrationUrl')
    .optional({ checkFalsy: true })
    .isURL(URL_OPTS)
    .withMessage('Registration link must be a valid URL (include https://)'),
];

/* ── Users / Profile ──────────────────────────────────── */
export const validateUpdateProfile = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Name must not exceed 100 characters'),
  body('bio')
    .optional()
    .isLength({ max: 160 }).withMessage('Bio must not exceed 160 characters'),
  body('organization')
    .optional()
    .isLength({ max: 150 }).withMessage('Organization must not exceed 150 characters'),
  body('designation')
    .optional()
    .isLength({ max: 100 }).withMessage('Designation must not exceed 100 characters'),
  body('phone')
    .optional({ checkFalsy: true })
    .matches(PHONE_RE)
    .withMessage('Invalid phone number format'),
  body('website')
    .optional({ checkFalsy: true })
    .isURL(URL_OPTS)
    .withMessage('Website must be a valid URL'),
  body('linkedin')
    .optional({ checkFalsy: true })
    .isURL(URL_OPTS)
    .withMessage('LinkedIn must be a valid URL'),
  body('instagram')
    .optional({ checkFalsy: true })
    .isURL(URL_OPTS)
    .withMessage('Instagram must be a valid URL'),
  body('github')
    .optional({ checkFalsy: true })
    .isURL(URL_OPTS)
    .withMessage('GitHub must be a valid URL'),
];

export const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

/* ── Support / Contact ────────────────────────────────── */
export const validateSubmitTicket = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name must not exceed 100 characters'),
  body('email')
    .trim()
    .isEmail().withMessage('A valid email address is required'),
  body('issueType')
    .notEmpty().withMessage('Issue type is required'),
  body('subject')
    .trim()
    .notEmpty().withMessage('Subject is required')
    .isLength({ max: 200 }).withMessage('Subject must not exceed 200 characters'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters'),
];

export const validateTicketReply = [
  body('message')
    .trim()
    .notEmpty().withMessage('Reply message is required')
    .isLength({ max: 2000 }).withMessage('Reply must not exceed 2000 characters'),
];
