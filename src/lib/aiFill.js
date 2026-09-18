import { supabase, isSupabaseConfigured } from './supabase';

// AI fill needs a server-side secret (the Anthropic API key), so it rides on
// the same Supabase project as auth/data via an Edge Function
// (supabase/functions/ai-fill) rather than calling a third-party API
// directly from the browser.
export const isAiFillConfigured = isSupabaseConfigured;

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
  if (!isAiFillConfigured) {
    throw new Error('AI fill needs Supabase configured first.');
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

  if (error) throw new Error(error.message || 'AI fill failed.');
  if (!data || typeof data !== 'object') throw new Error('AI fill returned an unexpected response.');

  return {
    name: typeof data.name === 'string' ? data.name : '',
    cuisine: typeof data.cuisine === 'string' ? data.cuisine : '',
    category: typeof data.category === 'string' ? data.category : '',
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter((s) => typeof s === 'string' && s.trim()) : [],
    method: Array.isArray(data.method) ? data.method.filter((s) => typeof s === 'string' && s.trim()) : [],
    note: typeof data.note === 'string' ? data.note : '',
  };
}
