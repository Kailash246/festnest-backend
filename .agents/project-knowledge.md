# FestNest Project Knowledge

Use this as a concise routing guide. `CLAUDE.md` and `CLAUDE_2.md` remain the authoritative project instructions.

## Repository

- `festnest-react/` is the React 18 + Vite 5 frontend.
- `festnest-backend/` is the Node.js + Express + MongoDB/Mongoose backend.
- The frontend and backend have separate npm manifests and lockfiles.
- Do not reorganize application folders or create a second agent directory.

## Frontend Routing

- Entry: `festnest-react/src/main.jsx`.
- Route shell and route declarations: `festnest-react/src/App.jsx`.
- Pages: `festnest-react/src/pages/`; reusable UI: `festnest-react/src/components/`.
- Shared state: `festnest-react/src/context/AppContext.jsx`, accessed through `useApp()`.
- API services and data shaping: `festnest-react/src/services/`.
- Static/fallback data: `festnest-react/src/data/`.
- Global styles and responsive `feed-grid`: `festnest-react/src/index.css`.
- Preserve `EventCard.jsx`; change event data shape in `src/services/normalise.js` when appropriate.

## Frontend Conventions

- Reuse the existing Tailwind/custom CSS system, Framer Motion animation system, and lucide-react icons.
- Current CSS tokens use Clash Display, Satoshi, and Geist font families plus indigo custom properties. Inspect the CSS before assuming a design token.
- Preserve existing route, auth-gate, `useApp()`, API response-envelope, and responsive conventions.
- Check mobile, tablet, desktop, and large desktop; do not change the named `feed-grid` breakpoints.

## Backend Routing

- Entry and middleware order: `festnest-backend/server.js`.
- Routes: `festnest-backend/routes/`; controllers: `festnest-backend/controllers/`.
- Models: `festnest-backend/models/`; auth and shared middleware: `festnest-backend/middleware/`.
- Shared utilities: `festnest-backend/utils/`.
- Preserve API contracts, validation, authentication, database schemas, and deployment behavior.
- The current project context identifies Resend as the email provider. Do not add SMTP/Nodemailer configuration.

## Workflow

1. Read the owning implementation, nearby callers, relevant service/data shape, and applicable skill.
2. Plan a small scoped change that reuses existing components and dependencies.
3. Implement without unrelated refactors or architecture migration.
4. Run the narrowest relevant validation.
5. For meaningful UI changes, use native browser inspection/screenshots when practical, then review accessibility and responsive behavior.
6. Inspect `git diff` and `git status --short`; leave commit and push to the human.

## Commands

- Frontend: from `festnest-react/`, `npm run dev`, `npm run build`, `npm run preview`.
- Backend: from `festnest-backend/`, `npm run dev`, `npm run start`, `npm run seed`.
- No project-owned test, lint, typecheck, Playwright, Cypress, Storybook, or Prettier scripts were found during the setup audit.
- Never run seed or connect to production data as part of routine validation.
