---
name: responsive-design
description: Use when implementing or reviewing FestNest responsive layouts for event cards, event details, navigation, filters, forms, and CTAs across mobile, tablet, desktop, and large desktop.
---

# Responsive Design

## When relevant

Use for layout changes or verification involving event cards, event detail pages, navigation, filters, forms, metadata, and CTA placement.

## Inspect first

- Read the owning component and its CSS/Tailwind classes, then check the existing breakpoints and shell layout.
- Treat the documented mobile, tablet, desktop, and large-desktop conventions as the source of truth; inspect `feed-grid` before touching it.

## Do

- Check mobile, tablet, desktop, and large desktop for text wrapping, image cropping, CTA visibility, overflow, clipping, and stable dimensions.
- Keep touch targets usable, controls reachable, and collapsed navigation/forms predictable.
- Prefer existing responsive utilities and constraints over viewport-specific hacks or new breakpoints.

## Avoid

- Do not invent breakpoints, change `feed-grid` breakpoints, or solve overflow by hiding meaningful content.
- Do not allow fixed widths, long labels, images, or CTA groups to create horizontal scrolling.

## Validate

Use browser inspection or screenshots when available, and exercise the affected interaction at representative sizes. Pair implementation work with `festnest-ui`, `accessibility`, and `safe-changes`.
