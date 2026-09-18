// Supabase Edge Function: tidies up a chef's dictated (or typed) meal
// description — fixes grammar/punctuation, drops filler words and false
// starts, keeps their own words and every detail they gave. Lives
// server-side because it needs GEMINI_API_KEY, which must never reach the
// browser.
//
// Deploy: supabase functions deploy clean-description
// Configure: supabase secrets set GEMINI_API_KEY=... (shared with ai-fill;
// free key from https://aistudio.google.com/apikey)

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    description: {
      type: 'STRING',
      description: 'The cleaned-up description, in the same voice and roughly the same length as the original.',
    },
  },
  required: ['description'],
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

  const { description } = payload || {};
  if (!description || typeof description !== 'string' || !description.trim()) {
    return jsonResponse({ error: 'A description is required.' }, 400);
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
                  text: [
                    "Clean up this chef's dictated description of a dish they cooked:",
                    `"${description.trim()}"`,
                    '',
                    'Fix grammar, punctuation, and capitalization. Remove filler words and',
                    "false starts (um, uh, like, you know). Don't add any facts, ingredients,",
                    "or details that weren't said. Keep their own words and voice, and keep",
                    'it roughly the same length.',
                  ].join('\n'),
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
      return jsonResponse({ error: 'AI response did not include a cleaned description.' }, 502);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return jsonResponse({ error: 'AI response was not valid JSON.' }, 502);
    }

    return jsonResponse({ description: typeof parsed.description === 'string' ? parsed.description : '' });
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Unexpected error contacting the AI.' }, 500);
  }
});
