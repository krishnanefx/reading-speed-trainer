import React, { useState, useEffect } from 'react';
import { isCloudSyncEnabled, supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { devError } from '../utils/logger';
import './Auth.css';

export const Auth: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [message, setMessage] = useState('');
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockUntil, setLockUntil] = useState<number | null>(null);

    useEffect(() => {
        if (!isCloudSyncEnabled || !supabase) return;

        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (lockUntil && Date.now() < lockUntil) {
            setMessage('Too many attempts. Please wait 30 seconds and try again.');
            return;
        }
        setLoading(true);
        setMessage('');

        try {
            if (!isCloudSyncEnabled || !supabase) {
                throw new Error('Cloud sync is disabled. Configure Supabase environment variables.');
            }
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage('Check your email for the confirmation link!');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                if (error) throw error;
            }
        } catch (error: unknown) {
            const attempts = failedAttempts + 1;
            setFailedAttempts(attempts);
            if (attempts >= 5) {
                setLockUntil(Date.now() + 30_000);
            }
            devError(error);
            setMessage('Sign in failed. Check your credentials or verify your email.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    };

    if (!isCloudSyncEnabled || !supabase) {
        return (
            <div className="auth-container">
                <h3>Cloud Sync Disabled</h3>
                <p className="auth-subtext no-margin">
                    Running in secure local-only mode. Add Supabase keys to enable account sync.
                </p>
            </div>
        );
    }

    if (user) {
        return (
            <div className="auth-container logged-in">
                <p>Logged in as: <strong>{user.email}</strong></p>
                <button className="btn-secondary" onClick={handleLogout}>Sign Out</button>
                <div className="cloud-status">
                    ☁️ Cloud Sync Active
                </div>
            </div>
        );
    }

    return (
        <div className="auth-container">
            <h3>{isSignUp ? 'Create Account' : 'Sign In'}</h3>
            <p className="auth-subtext">
                Sync your progress across devices.
            </p>

            <form onSubmit={handleAuth}>
                <div className="form-group">
                    <input
                        type="email"
                        placeholder="Your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <input
                        type="password"
                        placeholder="Your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                </div>
                <button className="btn-primary" disabled={loading}>
                    {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
                </button>
            </form>

            {message && <p className="auth-message">{message}</p>}

            <button className="btn-link" onClick={() => { setIsSignUp(!isSignUp); setMessage(''); }}>
                {isSignUp ? 'Already have an account? Sign In' : 'No account? Sign Up'}
            </button>
        </div>
    );
};
