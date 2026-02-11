import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { devWarn } from '../utils/logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isCloudSyncEnabled = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseClient: SupabaseClient | null = null;

if (isCloudSyncEnabled) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
} else {
    devWarn('Supabase is not configured. Running in local-only mode.');
}

export const supabase = supabaseClient;

export type Profile = {
    id: string;
    email: string | null;
    full_name: string | null;
    avatar_url: string | null;
};
