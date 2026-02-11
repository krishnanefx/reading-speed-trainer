# Contributing

## Workflow
- Work in small, reviewable commits.
- Run `npm run ci` before pushing.
- Update `REWRITE_TODO.md` when adding/completing significant work.

## Performance Guardrails
- Avoid loading full book content on list routes.
- Keep heavy parsing/tokenization off the main thread when possible.
- Keep bundle budgets green (`npm run budget`).
- Use perf diagnostics (`?perf=1` or `localStorage.flashread_perf=1`) for slow-path investigation.

## Security Guardrails
- Never commit `.env` or secret values.
- Treat `VITE_*` as public client values and avoid hardcoding project-specific secrets in source.
- Keep CSP and Netlify headers aligned with deployed behavior.

## Coding Standards
- Prefer pure helpers and deterministic data transforms.
- Keep component render paths light; avoid large inline style blocks.
- Prefer explicit type-safe interfaces over `any`.
- Add comments only where logic is non-obvious.

## Testing
- Run lint/build/budget/migration checks via `npm run ci`.
- For DB schema changes, update migration checks in `scripts/check-db-migrations.mjs`.
