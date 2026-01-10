import React from 'react';

interface ShortcutsHelpProps {
    isOpen: boolean;
    onClose: () => void;
}

const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="shortcuts-overlay" onClick={onClose}>
            <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
                <div className="shortcuts-header">
                    <h3>Keyboard Shortcuts</h3>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="shortcuts-list">
                    <div className="shortcut-item">
                        <span className="keys"><kbd>Space</kbd></span>
                        <span className="action">Play / Pause</span>
                    </div>
                    <div className="shortcut-item">
                        <span className="keys"><kbd>&uarr;</kbd> / <kbd>&darr;</kbd></span>
                        <span className="action">Adjust Speed (WPM)</span>
                    </div>
                    <div className="shortcut-item">
                        <span className="keys"><kbd>&larr;</kbd> / <kbd>&rarr;</kbd></span>
                        <span className="action">Rewind / Skip (10 chunks)</span>
                    </div>
                    <div className="shortcut-item">
                        <span className="keys"><kbd>Home</kbd> / <kbd>End</kbd></span>
                        <span className="action">Start / Finish</span>
                    </div>
                    <div className="shortcut-item">
                        <span className="keys"><kbd>F</kbd></span>
                        <span className="action">Toggle Focus Mode</span>
                    </div>
                    <div className="shortcut-item">
                        <span className="keys"><kbd>Esc</kbd></span>
                        <span className="action">Exit Focus / Back</span>
                    </div>
                </div>
            </div>

            <style>{`
                .shortcuts-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2000;
                    backdrop-filter: blur(4px);
                    animation: fadeIn 0.2s ease;
                }

                .shortcuts-modal {
                    background: var(--color-surface-solid);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: var(--radius-lg);
                    padding: 1.5rem;
                    width: 90%;
                    max-width: 400px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }

                .shortcuts-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    padding-bottom: 0.75rem;
                }

                .shortcuts-header h3 {
                    margin: 0;
                    font-size: 1.25rem;
                    color: var(--color-text);
                }

                .close-btn {
                    background: none;
                    border: none;
                    color: var(--color-text-secondary);
                    font-size: 1.5rem;
                    cursor: pointer;
                    padding: 0 0.5rem;
                    line-height: 1;
                }
                
                .close-btn:hover {
                    color: var(--color-text);
                }

                .shortcuts-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .shortcut-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 0.5rem;
                    border-radius: var(--radius-sm);
                    background: rgba(255, 255, 255, 0.03);
                }

                .keys {
                    display: flex;
                    gap: 0.25rem;
                }

                kbd {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-family: monospace;
                    font-size: 0.85rem;
                    min-width: 24px;
                    text-align: center;
                    box-shadow: 0 2px 0 rgba(255,255,255,0.1);
                }

                .action {
                    color: var(--color-text-secondary);
                    font-size: 0.9rem;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default ShortcutsHelp;
