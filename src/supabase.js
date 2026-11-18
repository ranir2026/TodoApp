import { createClient } from "@supabase/supabase-js";
import { AUTH_STORAGE_KEY, moveEarlierSignIn } from "./authStorage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
if (isSupabaseConfigured) moveEarlierSignIn(supabaseUrl);
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, { auth: { storageKey: AUTH_STORAGE_KEY } }) : null;
