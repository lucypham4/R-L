import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Phase 2 auth: Lucy and her partner each sign in with their own Supabase
 * account (created ahead of time via the Supabase dashboard — Authentication
 * → Users → Add user). There is no public sign-up here on purpose; this app
 * has exactly two intended users, not an open registration flow.
 */
export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured — sign-in is unavailable in demo mode.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthChange(callback) {
  if (!isSupabaseConfigured) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}
