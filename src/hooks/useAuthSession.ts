import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { isCloudSyncEnabled, supabase } from '../lib/supabase';

interface SessionUser {
    id: string;
}

export const useAuthSession = (): SessionUser | null => {
    const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);

    useEffect(() => {
        if (!isCloudSyncEnabled || !supabase) {
            toast('Cloud sync disabled: local-only mode', { id: 'local-only-toast', duration: 3500 });
            return;
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
            setSessionUser(session?.user ? { id: session.user.id } : null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSessionUser(session?.user ? { id: session.user.id } : null);
        });

        return () => subscription.unsubscribe();
    }, []);

    return sessionUser;
};
