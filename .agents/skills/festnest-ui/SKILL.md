---
name: festnest-ui
description: Use when implementing or reviewing FestNest event discovery UI, cards, details, navigation, filters, registration flows, forms, or visual polish in the existing React and Tailwind system.
---

# FestNest UI

## When relevant

Use for event discovery, event cards, featured event cards, sub-event cards, event detail pages, organizer pages, navigation, filters, registration UI, forms, badges, metadata, CTAs, and premium visual polish.

## Inspect first

- Read the owning page/component and nearby reusable components before editing.
- Check `src/index.css`, `tailwind.config.js`, `src/components`, and the relevant page data/service shape.
- Follow the existing Syne/DM Sans typography, indigo tokens, spacing rhythm, `useApp()` state, lucide-react icons, and Framer Motion patterns.

## Do

- Strengthen hierarchy, whitespace, typography, scanability, usability, and CTA priority.
- Reuse existing components and patterns; keep repeated event and metadata UI consistent.
- Preserve the custom `feed-grid` behavior and provide loading, empty, error, hover, focus, and disabled states.
- Validate representative mobile and desktop views and the affected interaction flow.

## Avoid

- Do not prescribe a new design system or migrate libraries.
- Avoid excessive gradients, glassmorphism, giant rounded containers, heavy shadows, unnecessary animation, random icon styles, and decoration without purpose.

## Validate

Run the narrowest relevant check, then the existing frontend build when practical. Review the diff for scope and confirm no route, API, state, or responsive convention changed accidentally.
