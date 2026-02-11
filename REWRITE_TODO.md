# FlashRead Rewrite TODO

## Phase 1 - Foundation (In Progress)
- [x] Split data reads for fast library startup (`book_meta` + lazy cover loading).
- [x] Add opt-in runtime perf timings (`?perf=1` / `localStorage.flashread_perf=1`).
- [ ] Introduce explicit app lifecycle state machine (`boot`, `hydrating`, `ready`, `error`, `offline`).
- [ ] Add deterministic migration framework tests for IndexedDB upgrades.
- [ ] Add perf budget checks for startup and open-book latency in CI.

## Phase 2 - Reader + Sync Core
- [ ] Move reader scheduling into dedicated engine/service outside component render path.
- [ ] Keep React as subscriber-only view for reader output.
- [ ] Make sync queue fully durable with persisted retry metadata.
- [ ] Implement queue compaction + idempotent replay by entity key.
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
- [ ] Add diagnostics panel for slow-path phases from perf logs.

## Phase 6 - Testing + Observability
- [ ] Unit tests for reader scheduler and sync merge logic.
- [ ] Integration tests for DB + sync queue replay/retry.
- [ ] E2E test for first load, open book, resume, and offline/online transitions.
- [ ] Structured telemetry/error reporting with privacy-safe payloads.
