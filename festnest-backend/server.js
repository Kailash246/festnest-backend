// server.js – FestNest API entry point
import 'dotenv/config';
import express         from 'express';
import cors            from 'cors';
import helmet          from 'helmet';
import morgan          from 'morgan';
import rateLimit       from 'express-rate-limit';
import mongoSanitize   from 'express-mongo-sanitize';

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

/* ── HTTPS redirect (Render terminates TLS; x-forwarded-proto carries the original scheme) ── */
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    next();
  });
}

/* ── Security headers (Helmet) ── */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", 'https://www.googletagmanager.com', 'https://www.google-analytics.com'],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'https://res.cloudinary.com', 'https://www.google-analytics.com'],
      connectSrc:     ["'self'", 'https://www.google-analytics.com'],
      fontSrc:        ["'self'"],
      objectSrc:      ["'none'"],
      frameSrc:       ["'none'"],
      frameAncestors: ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));
/* ── CORS ── */
// Allowed browser origins: production domains, Vercel deploy URL, local dev,
// plus any extra origins from CLIENT_URL / CLIENT_ORIGIN (comma-separated).
const allowedOrigins = [
  'https://festnest.in',
  'https://www.festnest.in',
  'https://festnest-react.vercel.app',
  'http://localhost:5173',
  ...(process.env.CLIENT_URL    || '').split(',').map(s => s.trim()).filter(Boolean),
  ...(process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
];

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no Origin (curl, server-to-server, health checks).
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false); // deny without throwing a 500
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count'],
}));

/* ── Logging & body parsing ── */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ── NoSQL injection protection ── */
app.use(mongoSanitize({ replaceWith: '_' }));

/* ── Global rate limiter ── */
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
}));

/* ── Stricter limiter for auth endpoints ── */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
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
