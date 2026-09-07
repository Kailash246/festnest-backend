---
name: accessibility
description: Use when implementing or reviewing FestNest accessibility for navigation, dialogs, event actions, filters, forms, registration UI, and responsive controls.
---

# Accessibility

## When relevant

Use for any UI implementation or review involving navigation, dialogs, event actions, filters, forms, registration, and responsive controls.

## Inspect first

- Read the owning component and identify interactive elements, focus movement, form associations, status messages, images, and motion.
- Check existing component patterns before introducing accessibility attributes or custom behavior.

## Do

- Prefer semantic HTML, meaningful headings, native buttons/links, associated labels, visible focus, logical keyboard order, and usable touch targets.
- Check dialog behavior, meaningful alt text, contrast, zoom/reflow, status/error messaging, and reduced-motion behavior.
- Preserve the current workflow and fix issues at the owning component.

## Avoid

- Do not add ARIA where native semantics are sufficient, use clickable non-controls, remove focus indicators, or hide content at zoom.

## Validate

Keyboard-test the affected flow and inspect representative responsive states. Pair implementation with `festnest-ui`, `responsive-design`, and `safe-changes`; report any manual-check limitation.
