// Supabase Edge Function: given a dish photo + the chef's brief description,
// asks Gemini to fill in the rest of the meal form (name, cuisine, category,
// ingredients, method, note) as structured JSON. Lives server-side because
// it needs GEMINI_API_KEY, which must never reach the browser. Gemini (not
// Anthropic) so this runs on Google AI Studio's free tier, no billing needed.
//
// Deploy: supabase functions deploy ai-fill
// Configure: supabase secrets set GEMINI_API_KEY=... (free key from
// https://aistudio.google.com/apikey)

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'A short, appetizing dish name.' },
    cuisine: {
      type: 'STRING',
      description: "The dish's cuisine, e.g. Italian, Japanese, Mexican. Empty string if unclear.",
    },
    category: {
      type: 'STRING',
      description: 'The menu course, e.g. Appetizer, Entree, Dessert. Empty string if unclear.',
    },
    ingredients: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: "5-12 likely ingredients, each a short lowercase phrase (e.g. 'garlic', 'shrimp').",
    },
    method: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '3-8 short cooking steps, in order, plain language, one action per step.',
    },
    note: {
      type: 'STRING',
      description:
        "One short, optional aside a chef might leave for future reference, under 90 characters. Empty string if there's nothing worth saying.",
    },
  },
  required: ['name', 'cuisine', 'category', 'ingredients', 'method', 'note'],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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

  const { description, image } = payload || {};
  if (!description || typeof description !== 'string' || !description.trim()) {
    return jsonResponse({ error: 'A description is required.' }, 400);
  }
  if (!image?.data || typeof image.data !== 'string') {
    return jsonResponse({ error: 'A photo is required.' }, 400);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: image.mediaType || 'image/png',
                    data: image.data,
                  },
                },
                {
                  text: `Photo of a dish, and the chef's own brief description: "${description.trim()}". Fill in your best-guess structured details for this dish.`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      return jsonResponse({ error: `AI request failed (${response.status}): ${errText}` }, 502);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return jsonResponse({ error: 'AI response did not include structured details.' }, 502);
    }

    let details;
    try {
      details = JSON.parse(text);
    } catch {
      return jsonResponse({ error: 'AI response was not valid JSON.' }, 502);
    }

    return jsonResponse(details);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Unexpected error contacting the AI.' }, 500);
  }
});
