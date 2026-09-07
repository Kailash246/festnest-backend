---
name: safe-changes
description: Use before any FestNest edit to preserve the React/Vite frontend, Express backend, API contracts, routing, state, authentication, and deployment boundaries.
---

# Safe Changes

## When relevant

Use for every coding, configuration, refactor, UI, integration, or review task in this repository.

## Inspect first

- Identify the owning file, callers, route, service, component, and existing tests or build command.
- Read relevant package manifests and project instructions before considering a dependency or configuration change.
- For cross-boundary work, verify the existing frontend/backend response and auth contract before editing.

## Do

- Make the smallest scoped, reversible change and reuse existing components, helpers, dependencies, and state management.
- For UI-only tasks, keep changes UI-only. Require explicit justification for dependency changes.
- Preserve routing, API contracts, authentication, database behavior, deployment, and existing Claude configuration.
- Validate the touched slice, inspect `git diff`, and check `git status --short` before finishing.

## Avoid

- Do not migrate frameworks, rewrite architecture, perform unrelated refactors, change protected configuration, or add speculative tooling.
- Never add secrets, edit environment files, or leave package/lockfile churn without a requested and justified need.

## Validate

Run the narrowest available lint, test, typecheck, syntax check, or build after editing. If no executable check exists, use a careful diff review and report that limitation.
