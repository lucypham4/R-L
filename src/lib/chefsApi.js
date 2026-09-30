import { supabase } from './supabase';

// Chefs created before page-theme-migration.sql ran won't have the
// column at all, so fall back to 'light' rather than rendering a public
// page with an undefined theme.
export const DEFAULT_PAGE_THEME = 'light';

function fromRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    pageTheme: row.page_theme === 'dark' ? 'dark' : DEFAULT_PAGE_THEME,
    // Missing entirely until avatar-migration.sql has run.
    avatarUrl: row.avatar_url ?? null,
  };
}

export async function fetchChefBySlug(slug) {
  const { data, error } = await supabase.from('chefs').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function fetchChefProfile(userId) {
  const { data, error } = await supabase.from('chefs').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

export async function isSlugAvailable(slug) {
  const { data, error } = await supabase.from('chefs').select('id').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return !data;
}

export async function createChefProfile({ id, slug, displayName }) {
  const { data, error } = await supabase
    .from('chefs')
    .insert({ id, slug, display_name: displayName })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

/**
 * Changes how this chef's public page renders for its visitors. Separate
 * from the chef's own in-app theme (lib/theme.js), which is a per-device
 * preference and follows the OS by default -- this one is a property of
 * the published page itself.
 */
export async function updateChefPageTheme(userId, pageTheme) {
  const { data, error } = await supabase
    .from('chefs')
    .update({ page_theme: pageTheme })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

/**
 * Sets the chef's profile picture, or clears it back to the default with
 * null. Needs avatar-migration.sql; until that has run, Supabase refuses
 * the column and the error says so.
 */
export async function updateChefAvatar(userId, avatarUrl) {
  const { data, error } = await supabase
    .from('chefs')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}
