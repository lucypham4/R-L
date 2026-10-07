import { supabase } from './supabase';
import { normaliseServes } from './meal';

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
  const serves = normaliseServes(meal.serves);
  return {
    name: meal.name,
    cuisine: meal.cuisine || '',
    category: meal.category || '',
    date: meal.date,
    // Left out when the chef didn't say, so the column's own answer stands
    // (null once serves-optional-migration.sql has run). Sending an explicit
    // null would fail outright on a project that hasn't run it yet.
    ...(serves !== null ? { serves } : {}),
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
 * Saves a chef's edits to a dish they already have. Photos and tags aren't
 * part of an edit and are left as they are. Needs summary-migration.sql,
 * which is what lets a chef update their own meals.
 *
 * Unlike a new meal, an edit sends what is blank as blank: a chef who clears
 * the summary or the serves means it, and leaving the key out would keep the
 * old value. (Clearing serves needs serves-optional-migration.sql, which
 * makes the column nullable.)
 */
export async function updateMeal(id, fields) {
  const row = {
    name: fields.name,
    cuisine: fields.cuisine || '',
    category: fields.category || '',
    date: fields.date,
    serves: normaliseServes(fields.serves),
    description: fields.description,
    ingredients: fields.ingredients ?? [],
    method: fields.method ?? [],
    note: fields.note || '',
    summary: fields.summary?.trim() ?? '',
  };
  const update = (r) => supabase.from('meals').update(r).eq('id', id).select();
  let { data, error } = await update(row);
  // As on insert: no summary column yet is no reason to lose the edit.
  if (error && isMissingColumn(error, 'summary')) {
    const { summary: _dropped, ...rest } = row;
    ({ data, error } = await update(rest));
  }
  if (error) throw error;
  // Row-level security turns an update no policy allows into an empty
  // success, as it does a delete (see deleteMeal). No row back, nothing saved.
  if (!data?.length) throw new Error("Couldn't save your changes to your account. The dish is as it was.");
  return fromRow(data[0]);
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
  // Asks for the deleted row back, because under row-level security a
  // delete that no policy allows isn't an error: it matches nothing and
  // reports success. That's how a signed-in chef's deletes once looked as
  // if they'd worked while changing nothing, and the dish came back on
  // the next reload (meal-delete-migration.sql). No row back, nothing went.
  const { data, error } = await supabase.from('meals').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error("Couldn't delete this dish from your account. It's still there.");
}
