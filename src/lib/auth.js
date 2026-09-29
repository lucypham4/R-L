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

// Where an emailed link sends the chef back to. On the web that's this
// app. Inside the iOS shell the origin is capacitor://localhost, which no
// mail app can open, so it's left out and Supabase falls back to the
// project's Site URL: the deployed web app.
function returnUrl() {
  const { protocol, origin } = window.location;
  return protocol === 'http:' || protocol === 'https:' ? `${origin}/` : undefined;
}

/**
 * Emails a link to choose a new password. Supabase answers the same way
 * whether or not the address has an account, so this can't be used to
 * find out who does; the screen says as much.
 */
export async function requestPasswordReset(email) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. This is unavailable in demo mode.');
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: returnUrl() });
  if (error) throw error;
}

// The reset link signs the chef in, but only so they can choose a new
// password. supabase-js announces that once, as PASSWORD_RECOVERY, and
// clears the link from the address bar, so the tab keeps a note of it:
// reloading the new-password screen shouldn't drop them into the app
// still not knowing their password.
const RECOVERY_KEY = 'staj-password-recovery';

export function isRecoveringPassword() {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberRecovery(on) {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1');
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Storage blocked: a reload loses the screen, nothing worse.
  }
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  rememberRecovery(false);
}

/**
 * A link from one of our emails that didn't work comes back with the
 * reason in the address bar's hash, and supabase-js leaves it there.
 * Returns what to tell the chef, or null, and tidies the address.
 */
export function takeEmailLinkError() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has('error_code') && !params.has('error_description')) return null;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', pathname + search);
  // Links last an hour and work once. Mail scanners that open links
  // before the chef does use them up, so this is the usual case.
  if (params.get('error_code') === 'otp_expired') {
    return 'That link has expired or has already been used. You can ask for a new one below.';
  }
  return params.get('error_description') || "That link didn't work. You can ask for a new one below.";
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
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') rememberRecovery(true);
    if (event === 'SIGNED_OUT') rememberRecovery(false);
    callback(session, event);
  });
  return () => subscription.unsubscribe();
}
