import { supabase, isSupabaseConfigured } from './supabase';
import { SUMMARY_MAX } from './meal';

// Both features below need a server-side secret (the Gemini API key), so
// they ride on the same Supabase project as auth/data via Edge Functions
// (supabase/functions/ai-fill, supabase/functions/clean-description)
// rather than calling a third-party API directly from the browser.
export const isAiConfigured = isSupabaseConfigured;

// How long the add-meal card waits for the fill before giving up. Without a
// limit a function that never answers would leave the card's fields locked
// under their skeletons, and Save disabled, until the chef thought to press
// Back. Generous, since a photo through Gemini's free tier can take a while;
// a chef who is tired of waiting can press Back sooner.
export const AI_FILL_TIMEOUT_MS = 30_000;

/**
 * Pulls the real reason out of a failed functions.invoke().
 *
 * supabase-js reports every non-2xx as a FunctionsHttpError whose message is
 * the generic "Edge Function returned a non-2xx status code". The actual
 * explanation -- "GEMINI_API_KEY is not configured on this project",
 * "AI request failed (404): ..." -- is in the JSON body, reachable only via
 * error.context (the underlying Response). Reading it is the difference
 * between a chef seeing a status-code string and seeing what to fix.
 */
async function messageFromFunctionsError(error, fallback) {
  try {
    const body = await error?.context?.json?.();
    if (body && typeof body.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // Not JSON (a platform-level 404 or 413 never reaches our handler, so it
    // has no body of ours); fall through to the generic message below.
  }
  // error.message here is supabase-js's own status-code string, which tells a
  // chef nothing, so prefer the caller's human wording.
  return fallback;
}

// The ai-fill function answers 502 for every failure upstream of it and puts
// Gemini's own status inside the message ("AI request failed (503): ..."), so
// this is the only place the browser can learn it. It reads the status out of
// that wording; supabase/functions/ai-fill/index.ts says so where it's built.
function upstreamStatusOf(message) {
  const match = /^AI request failed \((\d{3})\)/.exec(message);
  return match ? Number(match[1]) : null;
}

// Gemini is briefly overloaded (503) or rate-limited (429) far more often
// than it's actually down, and a try a moment later usually lands. Anything
// else (a bad key, a missing model) won't change in a few seconds.
//
// One retry after two seconds was not enough: an overload lasts longer than
// that, so the chef saw the failure notice and only got a fill by pressing
// Try again, which was really just a longer wait. So it is up to three tries
// in all, the pause growing as it goes (1.5s, then 3s: about 4.5s of waiting
// in the worst case), and the 30-second limit still covers the lot.
const RETRYABLE_UPSTREAM_STATUSES = new Set([503, 429]);
const RETRY_DELAYS_MS = [1500, 3000];

/**
 * True when a failed generateMealDetails() was the model being busy (503,
 * 429) rather than something a wait won't fix. The same two statuses it
 * retries on, so what the chef is told matches what was tried.
 */
export function isBusyFailure(error) {
  return RETRYABLE_UPSTREAM_STATUSES.has(error?.upstreamStatus);
}

async function invokeAiFill(body, timeout) {
  const { data, error } = await supabase.functions.invoke('ai-fill', { body, timeout });
  if (error) {
    // supabase-js aborts the request when the timeout passes and hands back
    // the fetch's own AbortError as the error's context. Not a Gemini status,
    // so it carries no upstreamStatus and is never retried.
    if (error.context?.name === 'AbortError') throw new Error('The AI took too long to answer.');
    const failure = new Error(
      await messageFromFunctionsError(error, "Couldn't reach the AI just now.")
    );
    failure.upstreamStatus = upstreamStatusOf(failure.message);
    throw failure;
  }
  return data;
}

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
 * Asks the ai-fill Edge Function to infer a full meal's details from a photo
 * and the chef's own freeform (unlimited-length) notes about the dish.
 *
 * An overloaded or rate-limited model (503, 429) is tried again, up to three
 * tries in all with a growing pause between them, before this gives up; any
 * other failure throws straight away. `onRetry`, if given, is called as each
 * wait begins, so a caller can tell the chef it's trying again rather than
 * still on the first go. The whole fill, retries included, gives up after
 * AI_FILL_TIMEOUT_MS.
 */
export async function generateMealDetails({ notes, photoBlob, photoMediaType, onRetry }) {
  if (!isAiConfigured) {
    throw new Error('This needs Supabase configured first.');
  }
  if (!photoBlob) {
    throw new Error('Add a photo or sketch first.');
  }

  const imageData = await blobToBase64(photoBlob);
  const body = {
    notes,
    image: { data: imageData, mediaType: photoMediaType || 'image/png' },
  };

  // The limit is for the whole fill, retries included, so each try gets what
  // the ones before it (and the pauses between) have left over rather than a
  // fresh 30 seconds.
  const deadline = Date.now() + AI_FILL_TIMEOUT_MS;
  let data;
  for (let attempt = 0; ; attempt += 1) {
    try {
      data = await invokeAiFill(body, Math.max(deadline - Date.now(), 1));
      break;
    } catch (failure) {
      const pause = RETRY_DELAYS_MS[attempt];
      if (!RETRYABLE_UPSTREAM_STATUSES.has(failure.upstreamStatus) || pause === undefined) throw failure;
      if (deadline - Date.now() - pause <= 0) throw failure;
      onRetry?.();
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }
  if (!data || typeof data !== 'object') throw new Error('Got an unexpected response.');

  return {
    name: typeof data.name === 'string' ? data.name : '',
    date: typeof data.date === 'string' ? data.date : '',
    description: typeof data.description === 'string' ? data.description : '',
    summary: cleanSummary(data.summary),
    cuisine: typeof data.cuisine === 'string' ? data.cuisine : '',
    category: typeof data.category === 'string' ? data.category : '',
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.filter((s) => typeof s === 'string' && s.trim()) : [],
    method: Array.isArray(data.method) ? data.method.filter((s) => typeof s === 'string' && s.trim()) : [],
    note: typeof data.note === 'string' ? data.note : '',
  };
}

// A summary is only any use whole. One that's missing or too long for the
// card comes back empty, and the card falls back (summaryOf) rather than
// being handed something it would have to cut.
function cleanSummary(value) {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  return s && s.length <= SUMMARY_MAX ? s : '';
}

/**
 * Asks the summarize-dish Edge Function to write the one-sentence summary
 * for a meal logged before the AI fill wrote one. Resolves to '' when it
 * couldn't, so a caller can try again another time.
 */
export async function summarizeDish(meal) {
  if (!isAiConfigured) return '';
  const { data, error } = await supabase.functions.invoke('summarize-dish', {
    body: {
      name: meal.name,
      description: meal.description,
      cuisine: meal.cuisine,
      category: meal.category,
      ingredients: meal.ingredients,
    },
  });
  if (error || !data) return '';
  return cleanSummary(data.summary);
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

  if (error) {
    throw new Error(
      await messageFromFunctionsError(error, "Couldn't reach the AI just now.")
    );
  }
  if (!data || typeof data.description !== 'string') throw new Error('Got an unexpected response.');

  return data.description;
}
