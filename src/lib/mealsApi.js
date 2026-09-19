import { supabase } from './supabase';

function fromRow(row) {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    name: row.name,
    cuisine: row.cuisine,
    category: row.category,
    date: row.date,
    serves: row.serves,
    description: row.description,
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
    serves: meal.serves || 2,
    description: meal.description,
    ingredients: meal.ingredients ?? [],
    method: meal.method ?? [],
    note: meal.note || '',
    tags: meal.tags ?? [],
    photos: meal.photos ?? [],
  };
}

export async function fetchMeals(userId) {
  const query = supabase.from('meals').select('*').order('date', { ascending: false });
  const { data, error } = userId ? await query.eq('user_id', userId) : await query;
  if (error) throw error;
  return data.map(fromRow);
}

export async function insertMeal(meal, userId) {
  const { data, error } = await supabase
    .from('meals')
    .insert({ ...toRow(meal), user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteMeal(id) {
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) throw error;
}
