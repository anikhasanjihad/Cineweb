import {createClient} from '@supabase/supabase-js';

// Same public (publishable) project the mobile app uses.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://brggwbhrdxozibqesbpu.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_miJxKvI3j4onueq7LX5R7g_bdrgDlFl';

export const supabase = createClient(URL, KEY, {
  auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: false},
});

export interface ServerRow {
  id: string;
  label: string;
  source_url: string;
  manifest_url: string | null;
  provider_value: string | null;
  logo_url?: string | null;
  position: number;
  hidden_providers?: string[] | null;
}
