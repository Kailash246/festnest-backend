# 🪺 FestNest Backend API

Production-ready REST API for the FestNest React app.

**Stack:** Node.js · Express · MongoDB Atlas · Mongoose · JWT + Refresh Tokens · OTP Email (Nodemailer) · Cloudinary

---

## Quick Start

```bash
# 1. Install
cd festnest-backend
npm install

# 2. Configure environment
cp .env.example .env
#    → Fill in MONGODB_URI, JWT secrets, SMTP credentials, Cloudinary keys

# 3. Seed the database
npm run seed

# 4. Start dev server (auto-reload)
npm run dev

# 5. Production
npm start
```

Server starts on **http://localhost:5000**. Hit `/health` to verify.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | — | Server port (default 5000) |
| `NODE_ENV` | — | `development` or `production` |
| `CLIENT_ORIGIN` | ✅ | Frontend URL for CORS (e.g. `http://localhost:5173`) |
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET` | ✅ | Access token signing secret (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | — | Access token lifetime (default `15m`) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token signing secret (min 32 chars) |
| `JWT_REFRESH_EXPIRES_IN` | — | Refresh token lifetime (default `30d`) |
| `SMTP_HOST` | ✅ | SMTP server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | ✅ | SMTP port (e.g. `587`) |
| `SMTP_SECURE` | — | `true` for port 465, `false` otherwise |
| `SMTP_USER` | ✅ | SMTP username / Gmail address |
| `SMTP_PASS` | ✅ | SMTP password / Gmail App Password |
| `MAIL_FROM` | — | Sender name + address |
| `CLOUDINARY_CLOUD_NAME` | ✅ | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | ✅ | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | ✅ | From Cloudinary dashboard |

> **Dev tip:** In `development` mode with no SMTP credentials, OTP emails are logged to the console and the OTP is returned in the API response — no email setup needed to get started.

---

## Project Structure

```
festnest-backend/
├── server.js                    # Entry point
├── .env.example                 # Copy → .env
│
├── config/
│   ├── db.js                    # MongoDB Atlas connection
│   └── cloudinary.js            # Cloudinary + multer storage config
│
├── models/
│   ├── User.js                  # User schema (bcrypt, initials, toPublic())
│   ├── RefreshToken.js          # Refresh tokens (TTL index → auto-expire)
│   ├── OTP.js                   # OTP codes (bcrypt-hashed, TTL index)
│   ├── Event.js                 # Event schema (text index for search)
│   └── index.js                 # SavedEvent, Registration, Notification,
│                                #   PointsLog, HostedEvent, SupportTicket, College
│
├── middleware/
│   ├── auth.js                  # requireAuth / optionalAuth (JWT)
│   └── errorHandler.js          # Global error handler + 404
│
├── controllers/
│   ├── authController.js        # register, login, OTP, refresh, logout, reset
│   ├── eventsController.js      # list, filter, detail, save, register, host
│   ├── usersController.js       # profile, avatar upload, password, registrations
│   ├── notificationsController.js
│   ├── leaderboardController.js # all-time + period aggregation
│   ├── collegeController.js
│   └── supportController.js
│
├── routes/                      # One file per resource
│
├── utils/
│   ├── jwt.js                   # signAccessToken, signRefreshToken, verify
│   ├── email.js                 # Nodemailer transporter + OTP email templates
│   ├── response.js              # ok(), fail(), created(), asyncHandler()
│   └── seed.js                  # Seeds events, colleges, demo users
│
└── api-client/
    └── api.js                   # Drop into React app: src/services/api.js
```

---

## Authentication Flow

### Registration
```
POST /api/auth/send-otp    { email, purpose: "verify_email" }
  → OTP emailed (10 min TTL, bcrypt-hashed in DB)

POST /api/auth/register    { name, email, otp, password, college?, city?, year?, branch? }
  → { user, accessToken, refreshToken }
```

### Login (password)
```
POST /api/auth/login       { email, password }
  → { user, accessToken, refreshToken }
```

### Passwordless Login
```
POST /api/auth/send-otp    { email, purpose: "login" }
POST /api/auth/login-otp   { email, otp }
  → { user, accessToken, refreshToken }
```

### Token Refresh
```
POST /api/auth/refresh     { refreshToken }
  → { accessToken, refreshToken }   ← tokens are rotated on every refresh
```

### Forgot Password
```
POST /api/auth/forgot-password   { email }
POST /api/auth/reset-password    { email, otp, newPassword }
  → all refresh tokens revoked on success
```

---

## API Reference

All endpoints are prefixed with `/api`. Authenticated routes require:
```
Authorization: Bearer <accessToken>
```

### Auth `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/send-otp` | — | Send OTP (purpose: verify_email / login / reset_password) |
| POST | `/register` | — | Create account (requires OTP) |
| POST | `/login` | — | Password login |
| POST | `/login-otp` | — | Passwordless OTP login |
| POST | `/refresh` | — | Rotate access + refresh tokens |
| POST | `/logout` | — | Revoke one refresh token |
| POST | `/logout-all` | ✅ | Revoke all sessions |
| POST | `/forgot-password` | — | Send reset OTP |
| POST | `/reset-password` | — | Set new password |
| GET | `/me` | ✅ | Current user from token |

### Events `/api/events`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | optional | List events. Query: `category`, `entryType`, `city`, `search`, `sort`, `page`, `limit` |
| GET | `/trending` | — | Top 5 trending events |
| GET | `/urgent` | — | Events with nearest deadlines |
| GET | `/saved` | ✅ | User's saved events |
| GET | `/:slug` | optional | Event detail + related + isSaved |
| POST | `/:slug/save` | ✅ | Save event |
| DELETE | `/:slug/save` | ✅ | Unsave event |
| POST | `/:slug/register` | ✅ | Register (+50 pts, confirmation email) |
| DELETE | `/:slug/register` | ✅ | Cancel registration |
| POST | `/host` | ✅ | Submit event (`multipart/form-data`, optional `bannerImage` → Cloudinary) |

**Sort options:** `trending` · `latest` · `oldest` · `registered` · `deadline`

### Users `/api/users`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/me` | ✅ | Profile + saved/registered counts |
| PATCH | `/me` | ✅ | Update name, college, city, year, branch, interests |
| POST | `/me/avatar` | ✅ | Upload avatar image → Cloudinary (`multipart/form-data`, field: `avatar`) |
| PATCH | `/me/password` | ✅ | Change password |
| GET | `/me/registrations` | ✅ | All registered events |
| GET | `/me/points` | ✅ | Points total + activity log |
| GET | `/me/hosted` | ✅ | Submitted hosting requests |

### Notifications `/api/notifications`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | ✅ | List. Query: `?type=deadlines\|updates\|system` |
| PATCH | `/read-all` | ✅ | Mark all read |
| PATCH | `/:id/read` | ✅ | Mark one read |
| DELETE | `/:id` | ✅ | Delete one |
| DELETE | `/` | ✅ | Clear all |

### Leaderboard `/api/leaderboard`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | optional | Rankings + podium. Query: `?period=all\|month\|semester` |

`month` and `semester` periods aggregate `PointsLog` for accurate time-bounded scores.

### College `/api/college`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/list` | — | All colleges. Search: `?q=...` |
| GET | `/my` | optional | College info + events + student count |
| PATCH | `/my` | ✅ | Set user's college |

### Support `/api/support`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/faqs` | — | FAQs. Filter: `?category=registration\|organiser\|account\|technical` |
| POST | `/contact` | optional | Submit support ticket |
| GET | `/tickets` | ✅ | User's own tickets |

---

## Admin System

FestNest has a built-in admin and approval system for hosted events.

### Roles

| Role | What they can do |
|---|---|
| `user` | Normal student — register, save, host submissions |
| `admin` | Review submissions, manage events, users, tickets |
| `superadmin` | Everything above + promote/demote other admins |

After seeding, the superadmin account is:
- **Email:** `admin@festnest.in`
- **Password:** `Admin@festnest1`

> Change this password immediately in production.

---

### Event Approval Flow

```
Student fills Host Event form
    ↓
POST /api/events/host   → HostedEvent created (status: "pending") + 300 pts awarded
    ↓
Admin reviews at GET /api/admin/submissions?status=pending
    ↓
  ┌─ POST /api/admin/submissions/:id/approve
  │     → Creates live Event document
  │     → Updates HostedEvent.linkedEvent
  │     → Sends in-app + email notification to submitter
  │
  └─ POST /api/admin/submissions/:id/reject  { reason }
        → Sends in-app + email notification with reason
```

---

### Admin API `/api/admin`

All routes require `Authorization: Bearer <adminAccessToken>`.

#### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats` | Total users, events, pending submissions, registrations, open tickets, trends |

#### Submissions (Approval System)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/submissions` | List submissions. Query: `?status=pending\|approved\|rejected\|all` |
| GET | `/submissions/:id` | Full submission detail |
| POST | `/submissions/:id/approve` | Approve → creates live Event. Optional body to override fields |
| POST | `/submissions/:id/reject` | Reject with `{ reason }` → email + notification sent |

**Approve with field overrides:**
```json
POST /api/admin/submissions/:id/approve
{
  "category": "Hackathon",
  "tags": ["36 Hours", "On-Site", "Open to All"],
  "highlights": ["🏆 ₹2L Prize", "🍕 Food Included"],
  "about": "Full description...",
  "badgeText": "🏆 ₹2L Prize"
}
```

#### Event Management
| Method | Endpoint | Description |
|---|---|---|
| GET | `/events` | All events (including inactive). Query: `search`, `category`, `isActive` |
| POST | `/events` | Create event directly (bypasses submission flow) |
| PATCH | `/events/:id` | Edit any field |
| DELETE | `/events/:id` | Soft-delete (sets `isActive: false`) |
| PATCH | `/events/:id/restore` | Re-activate |

#### User Management
| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | All users. Query: `search`, `role` |
| GET | `/users/:id` | Full profile + registrations, points log, hosted events |
| PATCH | `/users/:id/ban` | Toggle ban/unban |
| PATCH | `/users/:id/points` | Manually adjust points `{ points: 100, reason: "..." }` |
| PATCH | `/users/:id/role` | Set role (superadmin only) `{ role: "admin" }` |

#### Support Tickets
| Method | Endpoint | Description |
|---|---|---|
| GET | `/tickets` | All tickets. Query: `?status=open\|in_progress\|resolved` |
| PATCH | `/tickets/:id` | Update status `{ status, adminNote? }`. Sends email if resolved |

#### College Management
| Method | Endpoint | Description |
|---|---|---|
| POST | `/colleges` | Add college |
| PATCH | `/colleges/:id` | Update college |
| DELETE | `/colleges/:id` | Delete college |

#### Broadcast Notifications
| Method | Endpoint | Description |
|---|---|---|
| POST | `/notify` | Send to all users or specific IDs |

```json
POST /api/admin/notify
{
  "title": "New events near you!",
  "sub": "10 hackathons added this week.",
  "type": "system",
  "icon": "📢",
  "userIds": ["userId1", "userId2"]   // omit to send to ALL users
}
```

---

### Making Yourself Admin (first time setup)

After seeding, log in with the superadmin account via the normal login endpoint:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@festnest.in","password":"Admin@festnest1"}'
```

Use the returned `accessToken` in the `Authorization` header for all `/api/admin/*` calls.

---



| Action | Points | Trigger |
|---|---|---|
| Register for event | +50 | `POST /events/:slug/register` |
| Attend & check in | +150 | (admin/check-in endpoint) |
| Win a competition | +500 | (admin endpoint) |
| Refer a friend | +75 | (referral flow) |
| Host an event | +300 | `POST /events/host` |

---

## Cloudinary Uploads

### Event Banner (hosting form)
```
POST /api/events/host
Content-Type: multipart/form-data

Fields: eventName, college, eventType, startDate, city, ...
File:   bannerImage  (JPEG/PNG/WebP, max 5 MB)
```
Stored in Cloudinary folder `festnest/events`, auto-resized to 1200×630.

### User Avatar
```
POST /api/users/me/avatar
Content-Type: multipart/form-data

File: avatar  (JPEG/PNG/WebP, max 2 MB)
```
Stored in `festnest/avatars`, auto-cropped to 300×300 face-detect.

---

## Demo Accounts (after `npm run seed`)

| Email | Password | Points | Notes |
|---|---|---|---|
| `arjun@demo.festnest.in` | `Demo@1234` | 300 | 4 registrations, 5 notifications, points log |
| `nisha@demo.festnest.in` | `Demo@1234` | 0 | Fresh account |

---

## Connecting the React Frontend

1. Add to `festnest-react/.env`:
```
VITE_API_URL=http://localhost:5000/api
```

2. Copy `api-client/api.js` → `festnest-react/src/services/api.js`

3. Use in any component:
```js
import api from './services/api';

// Auth
const { data } = await api.auth.login('arjun@demo.festnest.in', 'Demo@1234');
// → { user, accessToken, refreshToken }  (tokens auto-stored in localStorage)

// Events
const { data } = await api.events.list({ category: 'Hackathon', sort: 'trending' });

// Register for event
await api.events.register('hackbits-2025');

// Upload avatar
await api.users.uploadAvatar(fileInputRef.current.files[0]);
```

4. Listen for forced logout (expired session):
```js
window.addEventListener('festnest:logout', () => {
  // Clear user state, redirect to login
});
```

---

## MongoDB Atlas Setup

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Database Access** → Add user with `readWriteAnyDatabase`
3. **Network Access** → Add your IP (or `0.0.0.0/0` for dev)
4. **Connect** → Drivers → copy the connection string into `MONGODB_URI`
5. Replace `<password>` in the URI with your DB user password

---

## Gmail SMTP Setup (for OTP emails)

1. Enable **2-Step Verification** on your Google account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Generate an App Password for "Mail"
4. Set `SMTP_USER=your@gmail.com` and `SMTP_PASS=<16-char app password>`
