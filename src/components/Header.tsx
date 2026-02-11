import React from 'react';
import type { SyncStatus } from '../utils/db/index';

interface HeaderProps {
  onNavigate: (view: string) => void;
  currentView: string;
  isOnline: boolean;
  isCloudSyncEnabled: boolean;
  syncStatus: SyncStatus;
}

const Header: React.FC<HeaderProps> = React.memo(({ onNavigate, currentView, isOnline, isCloudSyncEnabled, syncStatus }) => {
  const showSyncBadge = isCloudSyncEnabled && isOnline && (syncStatus.phase !== 'idle' || syncStatus.queueSize > 0);
  const syncLabel = syncStatus.phase === 'syncing'
    ? `SYNCING ${syncStatus.queueSize}`
    : `RETRY #${Math.max(1, syncStatus.retryAttempts)}`;
  return (
    <header className="header">
      <button className="logo" onClick={() => onNavigate('library')} aria-label="Go to library">
        <span className="logo-icon">⚡</span>
        <h1>FlashRead</h1>
        {!isCloudSyncEnabled && (
          <span className="local-badge" title="Cloud Sync Disabled">
            LOCAL
          </span>
        )}
        {!isOnline && (
          <span className="offline-badge" title="Offline Mode">
            OFFLINE
          </span>
        )}
        {showSyncBadge && (
          <span
            className={`sync-badge ${syncStatus.phase}`}
            title={syncStatus.lastError ?? 'Sync in progress'}
          >
            {syncLabel}
          </span>
        )}
      </button>
      {/* <p className="app-subtitle">Read faster. Learn more.</p> */}

      <nav className="header-nav">
        <button
          onClick={() => onNavigate('gym')}
          className={`nav-btn ${currentView === 'gym' ? 'active' : ''}`}
          title="Eye Gym"
          aria-label="Open Eye Gym"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
        <button
          onClick={() => onNavigate('achievements')}
          className={`nav-btn ${currentView === 'achievements' ? 'active' : ''}`}
          title="Achievements"
          aria-label="Open Achievements"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        </button>
        <button
          onClick={() => onNavigate('stats')}
          className={`nav-btn ${currentView === 'stats' ? 'active' : ''}`}
          title="Statistics"
          aria-label="Open Statistics"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`}
          title="Settings"
          aria-label="Open Settings"
        >
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </nav>
    </header>
  );
});

export default Header;
