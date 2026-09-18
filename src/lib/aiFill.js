import { supabase, isSupabaseConfigured } from './supabase';

// Both features below need a server-side secret (the Gemini API key), so
// they ride on the same Supabase project as auth/data via Edge Functions
// (supabase/functions/ai-fill, supabase/functions/clean-description)
// rather than calling a third-party API directly from the browser.
export const isAiConfigured = isSupabaseConfigured;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Asks the ai-fill Edge Function to infer the rest of a meal's details from
 * a photo and the chef's own brief, spoken-or-typed description.
 */
export async function generateMealDetails({ description, photoBlob, photoMediaType }) {
  if (!isAiConfigured) {
    throw new Error('This needs Supabase configured first.');
  }
  if (!photoBlob) {
    throw new Error('Add a photo or sketch first.');
  }

  const imageData = await blobToBase64(photoBlob);
  const { data, error } = await supabase.functions.invoke('ai-fill', {
    body: {
      description,
      image: { data: imageData, mediaType: photoMediaType || 'image/png' },
    },
  });

  if (error) throw new Error(error.message || 'Could not fill in details.');
  if (!data || typeof data !== 'object') throw new Error('Got an unexpected response.');

  return {
    name: typeof data.name === 'string' ? data.name : '',
    cuisine: typeof data.cuisine === 'string' ? data.cuisine : '',
    category: typeof data.category === 'string' ? data.category : '',
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter((s) => typeof s === 'string' && s.trim()) : [],
    method: Array.isArray(data.method) ? data.method.filter((s) => typeof s === 'string' && s.trim()) : [],
    note: typeof data.note === 'string' ? data.note : '',
  };
}

/**
 * Asks the clean-description Edge Function to tidy up a dictated (or typed)
 * description: fix grammar/punctuation, drop filler words, keep the meaning.
 */
export async function cleanDescription({ description }) {
  if (!isAiConfigured) {
    throw new Error('This needs Supabase configured first.');
  }
  if (!description || !description.trim()) {
    throw new Error('Write or dictate a description first.');
  }

  const { data, error } = await supabase.functions.invoke('clean-description', {
    body: { description },
  });

  if (error) throw new Error(error.message || 'Could not clean up the description.');
  if (!data || typeof data.description !== 'string') throw new Error('Got an unexpected response.');

  return data.description;
}
