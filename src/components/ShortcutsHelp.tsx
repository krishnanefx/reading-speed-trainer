import React from 'react';
import './ShortcutsHelp.css';

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
        </div>
    );
};

export default ShortcutsHelp;
