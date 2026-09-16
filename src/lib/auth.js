import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Open sign-up: any chef can create their own account and gets an
 * isolated set of meals plus a public page at /<slug> (see chefsApi.js).
 * Row-level security (multi-chef-migration.sql) scopes writes to
 * auth.uid(), so a new account can never see or touch another chef's data.
 */
export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Sign-in is unavailable in demo mode.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

/**
 * Returns the new session, or null if Supabase is configured to require
 * email confirmation first (Auth → Settings → "Confirm email"). In that
 * case there's no session until the user clicks the link in their inbox.
 */
export async function signUp(email, password) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Sign-up is unavailable in demo mode.');
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

/**
 * Re-sends the signup confirmation email. Needed because Supabase won't
 * send a fresh one if you sign up again with an email that already has a
 * pending, unconfirmed account (e.g. after mistyping the password the
 * first time). This is the only way to get another copy.
 */
export async function resendConfirmation(email) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. This is unavailable in demo mode.');
  }
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
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
