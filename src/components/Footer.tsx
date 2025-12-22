import React from 'react';

const Footer: React.FC = React.memo(() => {
    return (
        <footer style={{
            textAlign: 'center',
            padding: '2rem',
            color: 'var(--color-text-secondary)',
            fontSize: '0.9rem'
        }}>
            <p>&copy; {new Date().getFullYear()} FlashRead</p>
        </footer>
    );
});

export default Footer;
