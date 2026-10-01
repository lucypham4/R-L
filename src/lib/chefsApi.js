import { supabase } from './supabase';
import { cleanLinks } from './socialLinks';

// Chefs created before page-theme-migration.sql ran won't have the
// column at all, so fall back to 'light' rather than rendering a public
// page with an undefined theme.
export const DEFAULT_PAGE_THEME = 'light';

// A bio is a line or two, not a CV. bio-migration.sql holds the same limit.
export const BIO_MAX_LENGTH = 280;

// Tags under the chef's name. A handful says what they're known for; a
// long list says nothing. profile-details-migration.sql holds the same
// limit.
export const SPECIALTIES_MAX = 8;
export const SPECIALTY_MAX_LENGTH = 32;

function fromRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    pageTheme: row.page_theme === 'dark' ? 'dark' : DEFAULT_PAGE_THEME,
    // Missing entirely until avatar-migration.sql has run.
    avatarUrl: row.avatar_url ?? null,
    // Missing entirely until bio-migration.sql has run.
    bio: row.bio ?? '',
    // Both missing until profile-details-migration.sql has run.
    specialties: Array.isArray(row.specialties) ? row.specialties.filter((s) => typeof s === 'string') : [],
    links: cleanLinks(row.links),
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

const PROFILE_COLUMNS = {
  displayName: 'display_name',
  bio: 'bio',
  specialties: 'specialties',
  links: 'links',
};

/**
 * Changes what the chef's profile says about them: the name their public
 * page is titled with, the short bio under it, their specialties and
 * their links. Pass only what changed: each needs its migration
 * (bio-migration.sql, profile-details-migration.sql), and a chef whose
 * project hasn't run one can still change everything else. Until it has,
 * Supabase refuses the column and the error says so. The page name (slug)
 * isn't here: it's in every link they've already handed out.
 */
export async function updateChefProfile(userId, changes) {
  const row = Object.fromEntries(
    Object.entries(changes).map(([field, value]) => [PROFILE_COLUMNS[field], value])
  );
  const { data, error } = await supabase
    .from('chefs')
    .update(row)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}
