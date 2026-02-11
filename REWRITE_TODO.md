# FlashRead Rewrite TODO

## Working Mode
- Keep this file updated on every implementation push.
- Always pick the next unchecked item from the highest active phase.
- Add new TODOs when new bottlenecks are discovered.

## Current Sprint (Active)
- [x] CI: add lint/build/bundle budget checks on push/PR.
- [x] App lifecycle: include explicit `offline` phase behavior.
- [x] DB migrations: add deterministic migration tests.
- [x] Remove next heavy inline style block (`ReaderView`).
- [x] Add perf diagnostics panel based on `[perf]` phases.
- [x] Repo cleanup: remove stale docs/files, add ownership notes, and archive obsolete guides.

## Phase 1 - Foundation (In Progress)
- [x] Split data reads for fast library startup (`book_meta` + lazy cover loading).
- [x] Add opt-in runtime perf timings (`?perf=1` / `localStorage.flashread_perf=1`).
- [x] Introduce explicit app lifecycle state machine (`boot`, `hydrating`, `ready`, `error`, `offline`).
- [x] Add deterministic migration framework tests for IndexedDB upgrades (contract checks in CI).
- [x] Add perf budget checks for startup and open-book latency in CI (bundle size gate in CI).

## Phase 2 - Reader + Sync Core
- [x] Move reader scheduling into dedicated engine/service outside component render path.
- [x] Keep React as subscriber-only view for reader output.
- [x] Make sync queue fully durable with persisted retry metadata.
- [x] Implement queue compaction + idempotent replay by entity key.
- [x] Define conflict policy per entity type (progress/session/book).

## Phase 3 - Worker-First Heavy Processing
- [x] Move EPUB parsing to worker.
- [x] Add progressive EPUB ingestion for very large files.
- [x] Move tokenization/normalization heavy work off main thread.
- [x] Add backpressure for imports to avoid long main-thread blocks.
- [x] Remove duplicated EPUB parsing logic — `fileHelpers.ts` has a full main-thread parser that duplicates the worker; extract shared types and make the main-thread path a thin fallback only.

## Phase 4 - Security + Reliability
- [x] Remove remaining inline styles/scripts and drop CSP `unsafe-inline`.
- [x] Add strict runtime schema validation for all import/export formats.
- [x] Add versioned import migrations with checksum validation.
- [x] Finalize Supabase RLS policy audit against every synced table.
- [x] Add React Error Boundaries around each lazy-loaded view so a crash in one view doesn't blank the entire app.

## Phase 5 - UX/Performance Polish
- [x] Virtualize heavy list paths and preserve scroll position exactly (library uses incremental windowing + observer paging, visible-only cover hydration, and session-backed scroll restoration).
- [x] Add skeletons and phased loading UI for library and stats.
- [x] Remove remaining large inline style objects in interactive components.
- [x] Add diagnostics panel for slow-path phases from perf logs.
- [x] Extract inline `<style>` blocks to CSS modules — migrated `Auth`, `Achievements`, `Stats`, `Controls`, `Gym`, `ShortcutsHelp`, `InputArea`, `Reader`, and `Settings` to static CSS files.
- [x] Migrate remaining `style={{}}` inline objects in app components to CSS classes/semantic elements.
- [~] Add accessible labels, ARIA roles, and keyboard focus management — added ARIA labels to icon/actions, keyboard/role support for library cards and settings switches, and dialog semantics for modals; full a11y audit still pending.

## Phase 6 - Testing + Observability
- [ ] Unit tests for reader scheduler and sync merge logic.
- [ ] Integration tests for DB + sync queue replay/retry.
- [ ] E2E test for first load, open book, resume, and offline/online transitions.
- [~] Structured telemetry/error reporting with privacy-safe payloads (added structured logger with level/event payloads and basic sensitive-field redaction; backend sink still pending).
- [ ] Set up test infrastructure (Vitest) — currently zero test files exist anywhere in the project.
- [x] Add type-safe DB access — `getBooks()` uses `eslint-disable @typescript-eslint/no-explicit-any` to cast records; add proper typed helpers.

## Phase 7 - Repo Cleanup
- [x] Audit root files and archive docs no longer used by current architecture.
- [x] Add `docs/` structure with clear active vs legacy references.
- [x] Remove dead code paths, unused components, and stale comments (removed `onUpdateSettings` no-op path, stale DB comments, unused `AuthCallback`, and dead Gym error branch comment).
- [x] Add a `CONTRIBUTING.md` with coding/runtime/perf guardrails.

## Phase 8 - Architecture Refactors (New)
- [~] **Split `db.ts` monolith** — extracted shared models/types/sanitizers/checksum/import normalization into `src/utils/db/models.ts` and sync queue utilities into `src/utils/db/syncQueue.ts`; remaining split of sync/cloud/import-export modules still pending.
- [~] **Extract `App.tsx` concerns** — moved gamification/session update flow to `utils/gamification.ts`; further routing/session decomposition pending.
- [x] **Unify settings hydration** — `App` and `Settings` now use shared settings helpers (DB + localStorage write-through) for consistent load/save.
- [x] **Stabilize callback identities in `App.tsx`** — `onBack` handlers and `onUpdateStats` are now stable via `useCallback`.
- [x] **Fix hash-based routing edge cases** — added guard refs to prevent hashchange/view-sync feedback loops.
- [x] **Consolidate font-size setting** — removed `useState(3)` indirection in `App.tsx` and use constant default value.
- [x] **Lazy-load/remove `epubjs` dependency** — audited and removed unused `epubjs`; retained dedicated parsing chunk for `jszip`.
