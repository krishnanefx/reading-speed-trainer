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
- [ ] Remove remaining inline styles/scripts and drop CSP `unsafe-inline`.
- [x] Add strict runtime schema validation for all import/export formats.
- [x] Add versioned import migrations with checksum validation.
- [ ] Finalize Supabase RLS policy audit against every synced table.
- [ ] Add React Error Boundaries around each lazy-loaded view so a crash in one view doesn't blank the entire app.

## Phase 5 - UX/Performance Polish
- [~] Virtualize heavy list paths and preserve scroll position exactly (incremental windowing + observer paging added for library; exact scroll-restoration path still pending).
- [x] Add skeletons and phased loading UI for library and stats.
- [~] Remove remaining large inline style objects in interactive components (migrated `PerfDiagnostics` + app loader/toaster styles to static CSS; more component migrations pending).
- [x] Add diagnostics panel for slow-path phases from perf logs.
- [ ] Extract inline `<style>` blocks to CSS modules — currently 9 components (`Auth`, `Achievements`, `Stats`, `Controls`, `Gym`, `ShortcutsHelp`, `InputArea`, `Reader`, `Settings`) embed `<style>{...}</style>` JSX, which blocks CSP `unsafe-inline` removal and duplicates styles on every render.
- [ ] Migrate remaining 36+ `style={{}}` inline objects (across `PerfDiagnostics`, `Footer`, `Controls`, `Gym`, `Reader`, `Settings`, `Auth`, `App`) to CSS classes.
- [ ] Add accessible labels, ARIA roles, and keyboard focus management — several interactive elements (gym grid, achievement cards, nav buttons) lack `aria-label` or `role`.

## Phase 6 - Testing + Observability
- [ ] Unit tests for reader scheduler and sync merge logic.
- [ ] Integration tests for DB + sync queue replay/retry.
- [ ] E2E test for first load, open book, resume, and offline/online transitions.
- [ ] Structured telemetry/error reporting with privacy-safe payloads.
- [ ] Set up test infrastructure (Vitest) — currently zero test files exist anywhere in the project.
- [ ] Add type-safe DB access — `getBooks()` uses `eslint-disable @typescript-eslint/no-explicit-any` to cast records; add proper typed helpers.

## Phase 7 - Repo Cleanup
- [x] Audit root files and archive docs no longer used by current architecture.
- [x] Add `docs/` structure with clear active vs legacy references.
- [x] Remove dead code paths, unused components, and stale comments (removed `onUpdateSettings` no-op path, stale DB comments, unused `AuthCallback`, and dead Gym error branch comment).
- [x] Add a `CONTRIBUTING.md` with coding/runtime/perf guardrails.

## Phase 8 - Architecture Refactors (New)
- [ ] **Split `db.ts` monolith** — at 1106 lines and 63 exported functions, this file handles DB init, sync queue, cloud push/pull, import/export, CRUD, gamification progress, and conflict resolution. Split into `db/index.ts`, `db/sync.ts`, `db/cloud.ts`, `db/importExport.ts`, and `db/progress.ts`.
- [ ] **Extract `App.tsx` concerns** — `App.tsx` (345 lines) handles routing, auth session, sync orchestration, settings hydration, and gamification logic all in one component. Extract a `useAppState` hook or context for session/sync, move gamification to `utils/gamification.ts`, and consider a lightweight router.
- [ ] **Unify settings hydration** — `App.tsx` reads settings from DB-first with localStorage fallback during `loadData`, but `refreshSettings` reads localStorage directly, creating a split source of truth. Consolidate into a single `useSettings` hook backed by DB with localStorage as write-through cache.
- [ ] **Stabilize callback identities in `App.tsx`** — `onBack` handlers (e.g. `() => handleNavigate('library')`) and the `onUpdateStats` prop create new arrow functions every render, defeating `React.memo` on child components. Wrap in `useCallback` or use stable refs.
- [ ] **Fix hash-based routing edge cases** — `handleHashChange` and the `view → hash` sync effect can fight each other (setting hash triggers hashchange which sets view which sets hash). Consider using a proper tiny router or a single source of truth.
- [ ] **Consolidate font-size setting** — `defaultFontSize` is a `useState(3)` constant in `App.tsx` (never updated) and not persisted in the DB `UserProgress` type; either add it to the schema or remove the indirection.
- [ ] **Lazy-load `epubjs` dependency** — `epubjs` is in the `epub` manual chunk but is never imported anywhere in application code; it may be dead weight. Audit and remove if unused.
