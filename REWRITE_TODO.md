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
- [ ] Define conflict policy per entity type (progress/session/book).

## Phase 3 - Worker-First Heavy Processing
- [x] Move EPUB parsing to worker.
- [ ] Add progressive EPUB ingestion for very large files.
- [ ] Move tokenization/normalization heavy work off main thread.
- [ ] Add backpressure for imports to avoid long main-thread blocks.

## Phase 4 - Security + Reliability
- [ ] Remove remaining inline styles/scripts and drop CSP `unsafe-inline`.
- [ ] Add strict runtime schema validation for all import/export formats.
- [ ] Add versioned import migrations with checksum validation.
- [ ] Finalize Supabase RLS policy audit against every synced table.

## Phase 5 - UX/Performance Polish
- [ ] Virtualize heavy list paths and preserve scroll position exactly.
- [ ] Add skeletons and phased loading UI for library and stats.
- [ ] Remove remaining large inline style objects in interactive components.
- [x] Add diagnostics panel for slow-path phases from perf logs.

## Phase 6 - Testing + Observability
- [ ] Unit tests for reader scheduler and sync merge logic.
- [ ] Integration tests for DB + sync queue replay/retry.
- [ ] E2E test for first load, open book, resume, and offline/online transitions.
- [ ] Structured telemetry/error reporting with privacy-safe payloads.

## Phase 7 - Repo Cleanup (New)
- [x] Audit root files and archive docs no longer used by current architecture.
- [x] Add `docs/` structure with clear active vs legacy references.
- [x] Remove dead code paths, unused components, and stale comments (removed `onUpdateSettings` no-op path, stale DB comments, unused `AuthCallback`, and dead Gym error branch comment).
- [x] Add a `CONTRIBUTING.md` with coding/runtime/perf guardrails.
