import React from 'react';

interface HeaderProps {
    onNavigate: (view: string) => void;
    currentView: string;
}

const Header: React.FC<HeaderProps> = React.memo(({ onNavigate, currentView }) => {
    return (
        <>
            <header className="app-header">
                <div className="header-content">
                    <h1 className="app-title">
                        ⚡ FlashRead
                    </h1>
                    <p className="app-subtitle">Read faster. Learn more.</p>
                </div>

                <nav className="header-nav">
                    <button onClick={() => onNavigate('gym')} className={`nav-btn ${currentView === 'gym' ? 'active' : ''}`} title="Eye Gym">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    </button>
                    <button onClick={() => onNavigate('achievements')} className={`nav-btn ${currentView === 'achievements' ? 'active' : ''}`} title="Achievements">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                    </button>
                    <button onClick={() => onNavigate('stats')} className={`nav-btn ${currentView === 'stats' ? 'active' : ''}`} title="Statistics">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </button>
                    <button onClick={() => onNavigate('settings')} className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`} title="Settings">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </nav>
            </header>

            <style>{`
        .app-header {
          margin-bottom: 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          position: relative;
        }
        
        .header-content {
          text-align: center;
        }
        
        .app-title {
          font-size: 2.5rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%);
          background-size: 200% 200%;
          animation: gradientShift 3s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.03em;
        }
        
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        .app-subtitle {
          color: var(--color-text-secondary);
          margin: 0;
          font-size: 1.1rem;
        }
        
        .header-nav {
          display: flex;
          gap: 0.75rem;
          background: var(--color-surface);
          padding: 0.5rem;
          border-radius: var(--radius-full);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        
        .nav-btn {
          background: transparent;
          border: none;
          color: var(--color-text-secondary);
          padding: 0.75rem;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .nav-btn:hover {
          color: var(--color-text);
          background: rgba(255,255,255,0.1);
          transform: translateY(-2px);
        }

        .nav-btn.active {
          color: var(--color-primary);
          background: rgba(59, 130, 246, 0.1);
        }
        
        @media (max-width: 640px) {
          .app-header {
            flex-direction: row;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: 1.5rem;
            padding: 0 0.5rem;
          }
          
          .header-content {
            text-align: left;
          }
          
          .app-title {
            font-size: 1.5rem;
            margin: 0;
          }
          
          .app-subtitle {
            font-size: 0.8rem;
          }
          
          .header-nav {
            padding: 0.25rem;
            gap: 0.25rem;
            position: fixed;
            top: 1rem;
            right: 1rem;
            z-index: 50;
            backdrop-filter: blur(8px);
            background: rgba(15, 23, 42, 0.8);
          }
          
          .nav-btn {
            padding: 0.5rem;
          }
          
          .nav-btn svg {
            width: 20px;
            height: 20px;
          }
        }
      `}</style>
        </>
    );
});

export default Header;
