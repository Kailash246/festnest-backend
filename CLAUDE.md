# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

FestNest is a production SaaS platform for Indian college students to discover, register for, and participate in events (hackathons, cultural fests, workshops, competitions, internships). The repository has two separate apps:

```
festnest-react/      ← React + Vite frontend (port 5173)
festnest-backend/    ← Node.js + Express + MongoDB backend (port 5000)
```

---

## Commands

### Frontend (`cd festnest-react/`)
```bash
npm run dev       # Start Vite dev server at http://localhost:5173
npm run build     # Production build to dist/
npm run preview   # Preview production build locally
```

### Backend (`cd festnest-backend/`)
```bash
npm run dev       # Start with nodemon (auto-restart on changes)
npm run start     # Start without nodemon (production)
npm run seed      # Seed the database via utils/seed.js
```

### Environment Setup
- Frontend: `festnest-react/.env` — set `VITE_API_URL=http://localhost:5000/api`
- Backend: `festnest-backend/.env` — required vars:
  - `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
  - `JWT_ACCESS_EXPIRES_IN` (default: `15m`), `JWT_REFRESH_EXPIRES_IN` (default: `30d`)
  - `CLIENT_ORIGIN` (default: `http://localhost:5173`)
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - `NODEMAILER_*` vars for email (OTP, password reset)
  - `NODE_ENV` (`development` | `production`)

---

## Architecture

### Frontend Architecture

**Entry:** `src/main.jsx` wraps the app in `<BrowserRouter>` + `<AppProvider>`. `src/App.jsx` defines the shell layout and all 12 routes.

**Layout Shell** (`App.jsx`):
- CSS Grid: `[260px sidebar | 1fr main]` × `[64px header | 1fr content]`
- Mobile (< `md`): single column, `BottomNav` + `MobileDrawer` replace sidebar
- `<AuthOverlay>` and `<ToastContainer>` are mounted globally outside the grid

**Global State** (`src/context/AppContext.jsx`):
- Single context via `useApp()` hook — never bypass it with local auth state
- Exposes: `isLoggedIn`, `currentUser`, `isAdmin`, `login()`, `logout()`, `requireAuth()`
- `savedEvents` is a client-side `Set` of event slugs/IDs (not persisted to localStorage)
- Token refresh failure dispatches `festnest:logout` custom event → context resets all auth state
- Auth gate pattern: call `requireAuth()` before protected actions; it opens `AuthOverlay` if unauthenticated

**API Client** (`src/services/api.js`):
- Single `request()` function handles all HTTP calls with automatic JWT refresh (queue-based, prevents race conditions on concurrent 401s)
- Token storage keys: `fn_access`, `fn_refresh`, `fn_user` in localStorage
- All API modules (`auth`, `events`, `users`, `notifications`, `leaderboard`, `college`, `support`, `admin`) are named exports
- All responses follow `{ success: boolean, message: string, data: any }` — the client throws on `success: false`

**Routing** (`src/App.jsx`):
| Route | Page | Auth Required |
|---|---|---|
| `/` | Home (event feed + 3-layer filters) | No |
| `/explore` | All events | No |
| `/event/:id` | Event details | Yes |
| `/saved` | Saved events | Yes |
| `/profile` | User profile | Yes |
| `/notifications` | Notifications | No |
| `/college` | My College hub | No |
| `/host` | Submit event | No (prompts auth on submit) |
| `/leaderboard` | Rankings | No |
| `/about` | About page | No |
| `/support` | Help & contact | No |
| `/admin` | Admin dashboard | Admin role |

**Static Event Data:** `src/data/events.js` — used as fallback/mock data. Live data comes from the API.

---

### Backend Architecture

**Entry:** `server.js` — connects to MongoDB Atlas, applies middleware stack, mounts all route groups, registers error handlers.

**Middleware Stack Order** (matters for correctness):
1. `helmet()` — security headers
2. `cors()` — allow `CLIENT_ORIGIN`
3. `morgan()` — request logging
4. `express.json()` — body parsing (10 MB limit)
5. Global `rateLimit` — 200 req/15 min
6. Stricter `authLimiter` — 20 req/15 min on `/api/auth/login`, `/register`, `/send-otp`, `/forgot-password`
7. Route handlers
8. `notFound` — 404 catchall
9. `errorHandler` — global error handler (must be last)

**Route → Controller Map:**
```
/api/auth          → routes/auth.js          → controllers/authController.js
/api/events        → routes/events.js        → controllers/eventsController.js
/api/users         → routes/users.js         → controllers/usersController.js
/api/notifications → routes/notifications.js → controllers/notificationsController.js
/api/leaderboard   → routes/leaderboard.js   → controllers/leaderboardController.js
/api/college       → routes/college.js       → controllers/collegeController.js
/api/support       → routes/support.js       → controllers/supportController.js
/api/admin         → routes/admin.js         → controllers/adminController.js
```

**Auth Middleware** (`middleware/auth.js`):
- `requireAuth` — validates Bearer token, attaches fresh `req.user` (DB lookup every request, no stale data)
- `optionalAuth` — same but never blocks; use on public routes that personalize when logged in
- `requireAdmin` / `requireSuperAdmin` (`middleware/adminAuth.js`) — role-gated; also checks `isBanned`

**Response Helpers** (`utils/response.js`):
Always use these instead of `res.json()` directly: `ok()`, `created()`, `fail()`, `unauthorized()`, `forbidden()`, `notFoundRes()`, `asyncHandler()`

**JWT Utilities** (`utils/jwt.js`):
- `signAccessToken(payload)` / `signRefreshToken(payload)`
- `verifyAccessToken(token)` / `verifyRefreshToken(token)`
- Refresh tokens are stored in the `RefreshToken` collection (not just a secret — they are revocable)

---

### Data Models

| Model | Key Fields | Notes |
|---|---|---|
| `User` | `name`, `email`, `password` (hashed), `role`, `college`, `points`, `referralCode`, `isEmailVerified`, `isBanned`, `notificationPrefs` | `password` field is `select: false`; use `comparePassword()` method; `toPublic()` strips password |
| `Event` | `slug` (unique), `name`, `category`, `entryType`, `organiser`, `college`, `city`, `date`, `stats`, `trending`, `isActive`, `isApproved` | Primary lookup key is `slug`, not `_id`; text index on name/college/city/category |
| `OTP` | `email`, `otp` (hashed), `purpose`, `expiresAt` | TTL-based; purposes: `verify_email`, `reset_password` |
| `RefreshToken` | `token` (hashed), `user`, `expiresAt` | Stored to enable logout-all and token revocation |
| `SavedEvent` | `user`, `event` | Compound unique index `{ user, event }` |
| `Registration` | `user`, `event`, `status` | Compound unique index `{ user, event }` |
| `Notification` | `user`, `type`, `title`, `isRead` | Types: `deadlines`, `updates`, `system` |
| `PointsLog` | `user`, `action`, `points`, `event` | Actions: `register`, `attend`, `win`, `refer`, `host` |
| `HostedEvent` | `submittedBy`, `status`, `linkedEvent` | Status: `pending` → `approved`/`rejected`; `linkedEvent` populated on admin approval |
| `SupportTicket` | `user`, `name`, `email`, `issueType`, `status` | Status: `open` → `in_progress` → `resolved` |
| `College` | `name`, `city`, `state` | Text index on name+city for search |

Models in `models/index.js`: `SavedEvent`, `Registration`, `Notification`, `PointsLog`, `HostedEvent`, `SupportTicket`, `College`
Models in own files: `User` (`models/User.js`), `Event` (`models/Event.js`), `OTP` (`models/OTP.js`), `RefreshToken` (`models/RefreshToken.js`)

---

## Development Rules

### Before Making Changes
1. Read every file you plan to modify. Understand its full role before editing.
2. For any feature that crosses the frontend/backend boundary, verify the API contract (request shape, response shape, auth requirements) matches on both sides before coding.
3. Identify architectural issues or side effects before implementing new features.

### Code Standards
- Both projects use ES Modules (`"type": "module"`). Use `import`/`export`, never `require()`.
- Backend: always wrap async route handlers with `asyncHandler()` from `utils/response.js`.
- Backend: use the response helpers (`ok`, `fail`, `created`, etc.) — never call `res.json()` directly.
- Backend: use `express-validator` for request validation on all mutation endpoints.
- Frontend: access global state only through `useApp()`. Never read `localStorage` tokens directly in components — use `src/services/api.js`.
- Frontend: respect the `requireAuth()` gate before any protected action.

### Schema / API Changes
- When modifying a Mongoose model, consider backward compatibility with existing documents. Add `default` values for new required fields.
- When adding a new API endpoint, add a matching method to the appropriate module in `src/services/api.js`.
- The standard API response envelope is `{ success, message, data }`. Never deviate from this shape.

### Security
- Never log or expose JWT secrets, passwords, or OTPs.
- `password` is `select: false` on the User model — never return it. Use `user.toPublic()` when sending user objects.
- Admin routes must use `requireAdmin` or `requireSuperAdmin` middleware, not just `requireAuth`.
- Rate limiting is already applied globally and on auth routes — do not remove it.

### Responsive Design
- Mobile breakpoint is `md` (768 px in Tailwind, but the sidebar hides at 900 px via `hidden md:flex`).
- The feed grid in `src/index.css` uses named breakpoints: 1 column (mobile) → 3 columns (≥ 900 px) → 4 columns (≥ 1600 px).
- Always test layout changes at mobile, tablet, and desktop widths.

### Bug Fixes
- Find the root cause. Do not patch symptoms.
- For auth/token bugs, trace the full flow: `AuthOverlay` → `api.auth.*` → `AppContext.login()` → localStorage tokens.
- For save/register bugs, check both the client-side `savedEvents` Set in context and the backend `SavedEvent`/`Registration` collections.

### When Creating APIs
- Include `express-validator` validation and return structured errors via `fail(res, message, 400, errors)`.
- Use `asyncHandler()` wrapper so unhandled promise rejections reach `errorHandler`.
- Consider whether the endpoint needs `requireAuth`, `optionalAuth`, or no auth.

### Audit Reports
When asked to generate an audit report, cover: route coverage, auth guard correctness, input validation gaps, rate limiting adequacy, MongoDB index usage, frontend-backend contract alignment, and any hardcoded values that should be environment variables.
