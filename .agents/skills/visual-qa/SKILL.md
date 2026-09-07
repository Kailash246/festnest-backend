---
name: visual-qa
description: Use when reviewing rendered FestNest pages for visual regressions, responsive defects, interaction states, accessibility issues, or inconsistent event UI.
---

# Visual QA

## When relevant

Use after UI changes, for browser verification, or when investigating a rendered defect on public, authenticated, or form-heavy routes.

## Inspect first

- Identify the affected route, component, state, viewport, and intended behavior from nearby implementation and existing patterns.
- Check spacing, alignment, hierarchy, typography, contrast, component consistency, image dimensions/cropping, and overflow before subjective polish.

## Do

- Exercise hover, focus, loading, empty, error, disabled, navigation, and CTA states.
- Compare repeated event cards, metadata, buttons, and navigation for consistency across representative mobile and desktop views.
- Report route/component, viewport, reproduction steps, observed result, expected result, and severity.

## Severity

- **CRITICAL:** broken layout, inaccessible interaction, overflow blocking use, or functionality regression.
- **HIGH:** major hierarchy, alignment, responsive, contrast, or interaction defect.
- **MEDIUM:** inconsistent spacing, typography, imagery, or component styling.
- **LOW:** minor polish issue with no meaningful usability impact.

Prioritize usability and functional impact over subjective micro-details.

## Validate

Use browser inspection and screenshots when available. Pair responsive findings with `responsive-design` and accessibility findings with `accessibility`; do not modify application code unless a fix is explicitly requested.
