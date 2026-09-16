import { supabase } from './supabase';

function fromRow(row) {
  return { id: row.id, slug: row.slug, displayName: row.display_name };
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
