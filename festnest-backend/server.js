// server.js – FestNest API entry point
import 'dotenv/config';
import express      from 'express';
import cors         from 'cors';
import helmet       from 'helmet';
import morgan       from 'morgan';
import rateLimit    from 'express-rate-limit';

import connectDB    from './config/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

import authRoutes        from './routes/auth.js';
import eventRoutes       from './routes/events.js';
import userRoutes        from './routes/users.js';
import notifRoutes       from './routes/notifications.js';
import leaderboardRoutes from './routes/leaderboard.js';
import collegeRoutes     from './routes/college.js';
import supportRoutes     from './routes/support.js';
import adminRoutes       from './routes/admin.js';

/* ── Connect to MongoDB Atlas ── */
await connectDB();

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── Trust Render / proxy headers (required for rate-limit + correct IP) ── */
app.set('trust proxy', 1);

/* ── Security ── */
app.use(helmet());
app.use(cors({
  origin:      process.env.CLIENT_URL || process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

/* ── Logging & body parsing ── */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── Global rate limiter ── */
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests — please try again in a few minutes.' },
}));

/* ── Stricter limiter for auth endpoints ── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts — please try again in 15 minutes.' },
});
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register',        authLimiter);
app.use('/api/auth/send-otp',        authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

/* ── Health check ── */
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', env: process.env.NODE_ENV, ts: new Date().toISOString() })
);
app.get('/api/health', (_req, res) =>
  res.json({ success: true, status: 'ok', timestamp: new Date() })
);

/* ── API routes ── */
app.use('/api/auth',          authRoutes);
app.use('/api/events',        eventRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/leaderboard',   leaderboardRoutes);
app.use('/api/college',       collegeRoutes);
app.use('/api/support',       supportRoutes);
app.use('/api/admin',         adminRoutes);

/* ── Error handling (must be last) ── */
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  const resendKey = process.env.RESEND_API_KEY;
  console.log(`\n🪺  FestNest API  →  http://localhost:${PORT}`);
  console.log(`   ENV:            ${process.env.NODE_ENV || 'development'}`);
  console.log(`   RESEND_API_KEY: ${resendKey ? '✅ set (' + resendKey.slice(0, 8) + '...)' : '⚠️  NOT SET'}`);
  console.log(`   MAIL_FROM:      ${process.env.MAIL_FROM || '(default)'}\n`);
});

export default app;
