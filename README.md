# ⚡ FlashRead

**FlashRead** is a high-performance reading speed trainer application designed to help users increase their reading speed and comprehension through Rapid Serial Visual Presentation (RSVP) and Bionic Reading technologies.

Built with a focus on performance, battery efficiency, and offline-first reliability, FlashRead offers a premium, app-like experience on the web.

## 🚀 Key Features

-   **RSVP Reader**: Stream text word-by-word at speeds from 60 to 2000 WPM.
-   **Bionic Reading**: Highlights the start of words to guide the eye and improve brain processing speed.
-   **Offline-First Library**: Add books (paste text or upload) and read anywhere. Data stored locally via IndexedDB.
-   **Cloud Sync**: Seamlessly sync progress, books, and sessions across devices using Supabase.
-   **Gamification**: Track streaks, unlock achievements, and view detailed reading statistics.
-   **Eye Gym**: Exercises to improve peripheral vision and eye movement speed.
-   **PWA Support**: Installable as a native-like app on iOS and Android.
-   **Performance Optimized**: Engineered for minimal battery usage and stable high-speed rendering (60fps+).

## 🛠️ Tech Stack

-   **Frontend**: React 18, TypeScript, Vite
-   **State Management**: React Hooks (custom `useReader`), Local State
-   **Database**: IndexedDB (via `idb`) for local storage, Supabase for cloud sync
-   **Styling**: Pure CSS Variables with a responsive, modern design system
-   **Tooling**: ESLint, Prettier

## 🏗️ Architecture & Optimization

The codebase follows strict performance guidelines to ensure smooth text streaming at high speeds:

-   **Reader Isolation**: The main reading loop is isolated in `ReaderView.tsx` to prevent unnecessary re-renders of the global application state.
-   **Memoization**: Heavy components and calculation-intensive logic (like Bionic text processing) are memoized using `React.memo` and `useMemo`.
-   **Efficient Loops**: The critical RSVP timing loop uses `setTimeout` with drift correction logic and avoids React state thrashing.
-   **Clean Code**: Component-driven architecture with clear separation of concerns (Logic vs UI).

## 🚦 Getting Started

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/flashread.git
    cd flashread
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Start the development server**:
    ```bash
    npm run dev
    ```

4.  **Build for production**:
    ```bash
    npm run build
    ```

## 📱 Mobile Support

FlashRead is fully responsive and optimized for mobile devices. Add it to your home screen for the best experience (full-screen, standalone mode).

## 📄 License

MIT License.
