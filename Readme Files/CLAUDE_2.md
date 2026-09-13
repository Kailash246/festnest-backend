# FestNest — Claude Code Context
# Read this before every task. Follow these rules exactly.

## Repository Structure

### Backend
- GitHub: Kailash246/festnest-backend
- Local root: E:\FestNest Main  ← Git repo is HERE (not inside festnest-backend)
- Code lives in: E:\FestNest Main\festnest-backend\
- Branch: main (only — master was deleted)
- Deployment: Render (Root Directory = festnest-backend)

### Frontend  
- GitHub: Kailash246/festnest-react
- Local root: E:\FestNest Main\festnest-react  ← Git repo is HERE
- Branch: main (only)
- Deployment: Vercel

---

## Git Workflows

### Backend changes
cd "E:\FestNest Main"
git add festnest-backend/path/to/changed/file
git commit -m "message"
git push origin main

### Frontend changes
cd "E:\FestNest Main\festnest-react"
git add src/path/to/changed/file
git commit -m "message"
git push origin main

### Always run before any git operation
git status
git branch
git remote -v

---

## Email
- Provider: Resend (NOT Zoho SMTP, NOT Nodemailer)
- Domain: festnest.in (verified)
- From: noreply@festnest.in
- Env var: RESEND_API_KEY (set on Render)
- Never add nodemailer or SMTP config

---

## Tech Stack
- Frontend: React + Vite + Tailwind + Framer Motion + React Router v6
- Backend: Node.js + Express + MongoDB Atlas + Mongoose + JWT
- Auth: JWT access token + refresh token + OTP via Resend
- Images: Cloudinary (multer memoryStorage + upload_stream)
- Frontend URL: https://festnest.in (Vercel)
- Backend URL: https://festnest-backend.onrender.com (Render)

---

## Design System
- Primary color: #4F46E5 (Deep Indigo)
- Display font: Syne
- Body font: DM Sans
- Feed grid: custom CSS class feed-grid (NOT Tailwind breakpoints — do not change)

---

## Never Do
- Never recreate backend master branch
- Never recreate nested .git inside festnest-backend
- Never track frontend files from the backend repository
- Never use SMTP / Nodemailer for email
- Never commit .env files
- Never commit node_modules
- Never push to master (deleted — main only)
- Never change the feed-grid CSS class breakpoints
- Never modify EventCard.jsx directly (use normalise.js for data shape)

---

## Render Environment Variables (backend)
NODE_ENV=production
PORT=5000
MONGODB_URI=<atlas string>
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
CLIENT_URL=https://festnest.in
RESEND_API_KEY=<resend key>
MAIL_FROM=FestNest <noreply@festnest.in>
CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>

## Vercel Environment Variables (frontend)
VITE_API_URL=https://festnest-backend.onrender.com/api