// Asking Gemini for a structured answer, as all three functions that do it
// (ai-fill, clean-description, summarize-dish) ask: one model, and a second
// when the first is busy. Kept here so the three can't drift apart.
//
// Configure: supabase secrets set GEMINI_API_KEY=... (each function takes it
// itself, since it answers "not configured" before it gets here)
// Optional: GEMINI_MODEL overrides the default model, and
// GEMINI_FALLBACK_MODEL names a second one to ask when the first answers 503
// (overloaded) or 429 (rate-limited). Unset, there is no fallback.

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';
// The same request goes to the second model at once, from here, so a busy
// model costs the caller nothing: for ai-fill that also means the photo isn't
// sent up from the phone again.
const GEMINI_FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') || '';
// The statuses worth a second model: the same two the browser retries on
// (src/lib/aiFill.js).
const BUSY_STATUSES = new Set([503, 429]);

export type GeminiOutcome =
  | { ok: true; result: any }
  | { ok: false; status: number; text: string };

/**
 * Sends `requestBody` (a generateContent request, already JSON) to Gemini.
 *
 * A busy first model (503, 429) is answered by the fallback model when there
 * is one. If that fails as well, the failure reported is the first model's,
 * which is the one the browser's retry logic reads the status from; the
 * fallback's own is only logged (a mistyped fallback name would otherwise
 * hide a plain 503 behind a 404 that nothing retries).
 *
 * Keep the "AI request failed (<status>)" wording the callers build from
 * `status` and `text`: the browser (src/lib/aiFill.js) reads Gemini's status
 * out of it to decide whether a 503 or 429 is worth another try.
 */
export async function askGemini(apiKey: string, requestBody: string): Promise<GeminiOutcome> {
  const ask = (model: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: requestBody,
    });

  let response = await ask(GEMINI_MODEL);
  if (BUSY_STATUSES.has(response.status) && GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
    const primaryStatus = response.status;
    const primaryText = await response.text();
    console.warn(`${GEMINI_MODEL} answered ${primaryStatus}; asking ${GEMINI_FALLBACK_MODEL}`);
    const fallback = await ask(GEMINI_FALLBACK_MODEL);
    if (!fallback.ok) {
      console.error(`${GEMINI_FALLBACK_MODEL} answered ${fallback.status}: ${await fallback.text()}`);
      return { ok: false, status: primaryStatus, text: primaryText };
    }
    response = fallback;
  }

  if (!response.ok) return { ok: false, status: response.status, text: await response.text() };
  return { ok: true, result: await response.json() };
}
