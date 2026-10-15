# ⚡ FlashRead

**FlashRead** is a reading speed trainer that helps users increase their reading speed and comprehension through Rapid Serial Visual Presentation (RSVP) and Bionic Reading.

Built with a focus on performance, battery efficiency, and offline-first reliability, FlashRead offers an app-like experience on the web.

## 🚀 Key Features

-   **RSVP Reader**: Stream text word-by-word (or in chunks of up to 10 words) at 60–2000 WPM.
-   **Bionic Reading**: Highlights the start of words to guide the eye.
-   **Offline-First Library**: Add books by pasting text or uploading `.txt` / `.epub` files. Data is stored locally in IndexedDB.
-   **Cloud Sync (optional)**: Sign in to sync progress, books, and sessions across devices via Supabase. Without Supabase config the app runs in local-only mode.
-   **Import / Export**: Back up and restore your library as JSON from Settings.
-   **Gamification**: Track streaks, unlock achievements, and view reading statistics.
-   **Eye Gym**: A timed 5×5 number-grid (Schulte table) exercise for peripheral vision.
-   **PWA Support**: Installable on iOS and Android.

## 🛠️ Tech Stack

-   **Frontend**: React 19, TypeScript, Vite 7
-   **Storage**: IndexedDB (via `idb`) locally, Supabase for auth and cloud sync
-   **EPUB parsing**: JSZip, run in a Web Worker
-   **Styling**: Plain CSS with CSS variables
-   **Tooling**: ESLint, Node's built-in test runner
-   **Hosting**: Netlify (`netlify.toml`)

## 🏗️ Architecture & Optimization

The codebase follows strict performance guidelines to keep text streaming smooth at high speeds:

-   **Reader Engine**: RSVP scheduling lives in `src/reader/ReaderEngine.ts`, outside React. It uses drift-corrected `setTimeout` scheduling, and `useReader` / `ReaderView` simply subscribe to its snapshots.
-   **Workers**: EPUB parsing and tokenization run in Web Workers (`src/workers/`) to keep the main thread free.
-   **Durable Sync Queue**: Cloud writes go through a persisted queue with retries and idempotent replay (`src/utils/db/syncQueue.ts`).
-   **Fast Startup**: The library loads lightweight book metadata first and lazy-loads covers and content.
-   **Perf Diagnostics**: Add `?perf=1` to the URL (or set `localStorage.flashread_perf=1`) to show runtime timings.

## 🚦 Getting Started

Requires Node 20 or 22 (`engines: >=20 <23`; the PWA plugin is disabled on other versions).

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/krishnanefx/reading-speed-trainer.git
    cd reading-speed-trainer
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **(Optional) Configure cloud sync** — create `.env.local`:
    ```bash
    VITE_SUPABASE_URL=https://your-project.supabase.co
    VITE_SUPABASE_ANON_KEY=your-anon-key
    ```
    Then run `supabase_setup.sql` and `supabase_rls_hardening.sql` in the Supabase SQL editor. See [docs/ops/DB_SETUP_GUIDE.md](docs/ops/DB_SETUP_GUIDE.md).

4.  **Start the development server**:
    ```bash
    npm run dev
    ```

5.  **Build for production**:
    ```bash
    npm run build      # output in dist/
    npm run preview
    ```

## ✅ Checks

```bash
npm run lint              # ESLint
npm run test:unit         # reader engine, DB models, sync queue
npm run test:integration  # cloud sync, import/export
npm run test:migrations   # IndexedDB migration contract checks
npm run budget            # bundle size budget (run after build)
npm run ci                # all of the above, as run by GitHub Actions
```

## 📚 More Docs

-   [CONTRIBUTING.md](CONTRIBUTING.md): workflow and performance/security guardrails
-   [REWRITE_TODO.md](REWRITE_TODO.md): rewrite plan and progress
-   [docs/README.md](docs/README.md): index of deployment and database guides

## 📱 Mobile Support

FlashRead is responsive and works well on phones. Add it to your home screen for full-screen, standalone mode.
