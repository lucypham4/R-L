import { supabase } from './supabase';
import { DEFAULT_SERVES, normaliseServes } from './meal';

function fromRow(row) {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    name: row.name,
    cuisine: row.cuisine,
    category: row.category,
    date: row.date,
    serves: normaliseServes(row.serves),
    description: row.description,
    // Missing entirely until summary-migration.sql has run.
    summary: row.summary ?? '',
    ingredients: row.ingredients ?? [],
    method: row.method ?? [],
    note: row.note ?? '',
    tags: row.tags ?? [],
    photos: Array.isArray(row.photos) ? row.photos : [],
  };
}

function toRow(meal) {
  return {
    name: meal.name,
    cuisine: meal.cuisine || '',
    category: meal.category || '',
    date: meal.date,
    serves: normaliseServes(meal.serves) ?? DEFAULT_SERVES,
    description: meal.description,
    ingredients: meal.ingredients ?? [],
    method: meal.method ?? [],
    note: meal.note || '',
    tags: meal.tags ?? [],
    photos: meal.photos ?? [],
    // Only sent when there is one: see insertMeal.
    ...(meal.summary?.trim() ? { summary: meal.summary.trim() } : {}),
  };
}

// PostgREST's answer to a column it doesn't know, which is what a project
// that hasn't run a migration yet gives for that migration's column.
function isMissingColumn(error, column) {
  return error?.code === 'PGRST204' && String(error.message).includes(`'${column}'`);
}

export async function fetchMeals(userId) {
  const query = supabase.from('meals').select('*').order('date', { ascending: false });
  const { data, error } = userId ? await query.eq('user_id', userId) : await query;
  if (error) throw error;
  return data.map(fromRow);
}

export async function insertMeal(meal, userId) {
  const row = { ...toRow(meal), user_id: userId };
  const insert = (r) => supabase.from('meals').insert(r).select().single();
  let { data, error } = await insert(row);
  // Before summary-migration.sql has run there's nowhere to put a summary.
  // Losing it beats losing the meal: save without, and the card makes one
  // from the description instead (summaryOf).
  if (error && 'summary' in row && isMissingColumn(error, 'summary')) {
    const { summary: _dropped, ...rest } = row;
    ({ data, error } = await insert(rest));
  }
  if (error) throw error;
  return fromRow(data);
}

/**
 * Saves a summary written for a meal after the fact. Needs
 * summary-migration.sql, which adds the column and lets a chef update
 * their own meals.
 */
export async function updateMealSummary(id, summary) {
  const { data, error } = await supabase.from('meals').update({ summary }).eq('id', id).select().single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteMeal(id) {
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) throw error;
}
