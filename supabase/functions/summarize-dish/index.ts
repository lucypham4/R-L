// Supabase Edge Function: writes the one-sentence summary for a dish's
// resting card from what the chef has already logged about it. The AI fill
// writes one for new meals; this is for meals logged before that, whose
// card would otherwise have to make do with the ingredients. The app calls
// it once per meal, the first time its chef opens it, and saves the
// result. Lives server-side because it needs GEMINI_API_KEY.
//
// Deploy: supabase functions deploy summarize-dish
// Configure: supabase secrets set GEMINI_API_KEY=... (shared with ai-fill)

import { SUMMARY_GUIDANCE, cleanSummary } from '../_shared/summary.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: { summary: { type: 'STRING', description: SUMMARY_GUIDANCE } },
  required: ['summary'],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: 'GEMINI_API_KEY is not configured on this project.' }, 500);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const description = text(payload?.description, 400);
  if (!description) {
    return jsonResponse({ error: 'A description is required.' }, 400);
  }
  const ingredients = Array.isArray(payload?.ingredients)
    ? payload.ingredients.filter((s: unknown) => typeof s === 'string').slice(0, 12)
    : [];
  const facts = [
    text(payload?.name, 120) && `Name: ${text(payload.name, 120)}`,
    text(payload?.cuisine, 60) && `Cuisine: ${text(payload.cuisine, 60)}`,
    text(payload?.category, 60) && `Course: ${text(payload.category, 60)}`,
    ingredients.length > 0 && `Ingredients: ${ingredients.join(', ')}`,
    `Description: "${description}"`,
  ].filter(Boolean);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: [
                    'A dish from a chef\'s recipe archive:',
                    ...facts,
                    '',
                    `Write its summary: ${SUMMARY_GUIDANCE}`,
                    "Don't add anything the details above don't say.",
                  ].join('\n'),
                },
              ],
            },
          ],
          generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      return jsonResponse({ error: `AI request failed (${response.status}): ${errText}` }, 502);
    }

    const result = await response.json();
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text;
    let summary = '';
    try {
      summary = cleanSummary(JSON.parse(raw ?? '{}').summary);
    } catch {
      return jsonResponse({ error: 'AI response was not valid JSON.' }, 502);
    }
    if (!summary) {
      return jsonResponse({ error: 'The AI did not write a summary short enough to use.' }, 502);
    }
    return jsonResponse({ summary });
  } catch (err) {
    return jsonResponse({ error: (err as Error)?.message || 'Unexpected error contacting the AI.' }, 500);
  }
});
