import React from 'react';
import './Footer.css';

const Footer: React.FC = React.memo(() => {
    return (
        <footer className="app-footer">
            <p>&copy; {new Date().getFullYear()} FlashRead</p>
        </footer>
    );
});

export default Footer;
