// controllers/authController.js
import User          from '../models/User.js';
import OTP           from '../models/OTP.js';
import RefreshToken  from '../models/RefreshToken.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, refreshTokenExpiry } from '../utils/jwt.js';
import { sendOTPEmail, sendPasswordResetEmail } from '../utils/email.js';
import { ok, created, fail, unauthorized, asyncHandler } from '../utils/response.js';

/* ── helpers ── */
function clientInfo(req) {
  return {
    userAgent: req.headers['user-agent'] || '',
    ip:        req.ip || '',
  };
}

async function issueTokens(user, req) {
  const payload       = { id: user._id, email: user.email };
  const accessToken   = signAccessToken(payload);
  const refreshPayload= { id: user._id };
  const rawRefresh    = signRefreshToken(refreshPayload);

  await RefreshToken.create({
    user:      user._id,
    token:     rawRefresh,
    expiresAt: refreshTokenExpiry(),
    ...clientInfo(req),
  });

  return { accessToken, refreshToken: rawRefresh };
}

/* ────────────────────────────────────────────────────────
   POST /api/auth/send-otp
   Body: { email, purpose? }
──────────────────────────────────────────────────────── */
export const sendOtp = asyncHandler(async (req, res) => {
  const { email, purpose = 'verify_email' } = req.body;
  if (!email) return fail(res, 'Email is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'Invalid email address');

  // For sign-up verification, reject up front if the email already belongs to an
  // account — this lets the client surface the error on the signup step before an
  // OTP is ever sent, instead of failing later at register().
  if (purpose === 'verify_email') {
    const existing = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existing)
      return fail(res, 'This email is already registered. Please log in instead.', 409);
  }

  const code = await OTP.createOTP(email.toLowerCase(), purpose);

  // Send email non-fatally — if SMTP not configured, sendOTPEmail logs to console
  // and returns without throwing. OTP is always saved in DB.
  sendOTPEmail(email.toLowerCase(), code, purpose).catch(err =>
    console.error('[OTP EMAIL]', err.message)
  );

  // Always return OTP in development so registration works without SMTP setup
  const devData = process.env.NODE_ENV !== 'production' ? { otp: code } : {};

  console.log(`\n🔑  OTP for ${email} [${purpose}]: ${code}\n`);

  return ok(res, devData, `OTP sent to ${email}`);
});

/* ────────────────────────────────────────────────────────
   POST /api/auth/register
   Body: { name, email, otp, password, college?, city?, year?, branch? }
──────────────────────────────────────────────────────── */
export const register = asyncHandler(async (req, res) => {
  const {
    name, email, otp, password,
    college = '', city = '', year = '', branch = '',
    organization = '', designation = '',
    role: rawRole,
  } = req.body;

  if (!name || !email || !otp || !password)
    return fail(res, 'name, email, otp and password are required');
  if (password.length < 8)
    return fail(res, 'Password must be at least 8 characters');

  // Self-registration can only yield 'user' or 'organizer' — never admin roles
  const role = rawRole === 'organizer' ? 'organizer' : 'user';

  // Designation is mandatory for organizers
  if (role === 'organizer' && (!designation || designation.trim().length < 2))
    return fail(res, 'Designation is required for organizers');

  const lower = email.toLowerCase();

  const valid = await OTP.verifyOTP(lower, otp, 'verify_email');
  if (!valid) return fail(res, 'This OTP has expired or is invalid. Please request a new one.');

  const existing = await User.findOne({ email: lower });
  if (existing) {
    if (existing.isEmailVerified)
      return fail(res, 'This email is already registered. Please log in instead.', 409);
    // Unverified account — delete it and allow re-registration
    await User.deleteOne({ _id: existing._id });
  }

  const refCode = name.replace(/\s+/g, '').toUpperCase().slice(0, 5)
    + Math.floor(1000 + Math.random() * 9000);

  const user = await User.create({
    name, email: lower, password,
    college, city, year, branch,
    organization: organization.trim(),
    designation:  designation.trim(),
    role,
    referralCode: refCode,
    isEmailVerified: true,
  });

  const tokens = await issueTokens(user, req);
  return created(res, { user: user.toPublic(), ...tokens }, 'Account created successfully');
});

/* ────────────────────────────────────────────────────────
   POST /api/auth/login
   Body: { email, password }
──────────────────────────────────────────────────────── */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return fail(res, 'Email and password are required');

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password)))
    return unauthorized(res, 'Incorrect email or password.');

  const tokens = await issueTokens(user, req);
  return ok(res, { user: user.toPublic(), ...tokens }, 'Login successful');
});

/* ────────────────────────────────────────────────────────
   POST /api/auth/login-otp   (passwordless)
   Body: { email, otp }
──────────────────────────────────────────────────────── */
export const loginWithOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return fail(res, 'Email and OTP are required');

  const lower = email.toLowerCase();
  const valid = await OTP.verifyOTP(lower, otp, 'login');
  if (!valid) return fail(res, 'This OTP has expired or is invalid. Please request a new one.');

  let user = await User.findOne({ email: lower });
  if (!user) {
    user = await User.create({
      name: lower.split('@')[0],
      email: lower,
      password: Math.random().toString(36) + Math.random().toString(36),
      isEmailVerified: true,
    });
  }

  const tokens = await issueTokens(user, req);
  return ok(res, { user: user.toPublic(), ...tokens }, 'Login successful');
});

/* ────────────────────────────────────────────────────────
   POST /api/auth/refresh
   Body: { refreshToken }
──────────────────────────────────────────────────────── */
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return fail(res, 'Refresh token required');

  let payload;
  try { payload = verifyRefreshToken(refreshToken); }
  catch { return unauthorized(res, 'Invalid refresh token'); }

  const stored = await RefreshToken.findOne({
    token: refreshToken,
    expiresAt: { $gt: new Date() },
  });
  if (!stored) return unauthorized(res, 'Refresh token revoked or expired');

  const user = await User.findById(payload.id);
  if (!user) return unauthorized(res, 'User not found');

  // Rotate: delete old, issue new pair
  await RefreshToken.deleteOne({ _id: stored._id });
  const tokens = await issueTokens(user, req);

  return ok(res, tokens, 'Tokens refreshed');
});

/* ────────────────────────────────────────────────────────
   POST /api/auth/logout
   Body: { refreshToken }
──────────────────────────────────────────────────────── */
export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await RefreshToken.deleteOne({ token: refreshToken });
  return ok(res, {}, 'Logged out successfully');
});

/* ────────────────────────────────────────────────────────
   POST /api/auth/logout-all    (revoke all sessions)
──────────────────────────────────────────────────────── */
export const logoutAll = asyncHandler(async (req, res) => {
  await RefreshToken.deleteMany({ user: req.user._id });
  return ok(res, {}, 'All sessions revoked');
});

/* ────────────────────────────────────────────────────────
   POST /api/auth/forgot-password
   Body: { email }
──────────────────────────────────────────────────────── */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  // Neutral response — identical whether or not the email is registered
  const RESET_MSG = 'If this email is registered you will receive a reset code.';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return fail(res, 'Please enter a valid email address');

  const lower = email.toLowerCase();
  const user  = await User.findOne({ email: lower });

  // Never reveal whether the account exists (anti-enumeration)
  if (!user) return ok(res, {}, RESET_MSG);

  const code = await OTP.createOTP(lower, 'reset_password');
  console.log('RESET OTP for', lower, ':', code);

  // Fire-and-forget — email delivery must never block or fail the request
  sendPasswordResetEmail(lower, code).catch(err =>
    console.error('[RESET EMAIL]', err.message)
  );

  // Surface the OTP in non-production so the flow is testable without a mailbox
  const devData = process.env.NODE_ENV !== 'production' ? { otp: code } : {};
  return ok(res, devData, RESET_MSG);
});

/* ────────────────────────────────────────────────────────
   POST /api/auth/reset-password
   Body: { email, otp, newPassword }
──────────────────────────────────────────────────────── */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return fail(res, 'email, otp and newPassword are required');
  if (newPassword.length < 8) return fail(res, 'Password must be at least 8 characters');

  const lower = email.toLowerCase();
  const valid = await OTP.verifyOTP(lower, otp, 'reset_password');
  if (!valid) return fail(res, 'Invalid or expired reset code. Please request a new one.');

  const user = await User.findOne({ email: lower }).select('+password');
  if (!user) return fail(res, "We couldn't find an account with that email.", 404);

  user.password = newPassword;     // re-hashed by the User pre-save hook
  await user.save();

  // Delete used reset OTPs and revoke all sessions (force re-login everywhere)
  await OTP.deleteMany({ email: lower, purpose: 'reset_password' });
  await RefreshToken.deleteMany({ user: user._id });

  return ok(res, {}, 'Password reset successfully. You can now log in.');
});

/* ────────────────────────────────────────────────────────
   GET /api/auth/me   (returns current user from access token)
──────────────────────────────────────────────────────── */
export const getMe = asyncHandler(async (req, res) => {
  return ok(res, { user: req.user.toPublic() });
});
