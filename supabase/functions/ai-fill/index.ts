// Supabase Edge Function: given a dish photo + the chef's brief description,
// asks Claude to fill in the rest of the meal form (name, cuisine, category,
// ingredients, method, note) as structured JSON. Lives server-side because
// it needs ANTHROPIC_API_KEY, which must never reach the browser.
//
// Deploy: supabase functions deploy ai-fill
// Configure: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FILL_TOOL = {
  name: 'fill_meal_details',
  description:
    "Structured details for a home-cooked or restaurant dish, inferred from a photo and the chef's own brief description.",
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'A short, appetizing dish name.' },
      cuisine: {
        type: 'string',
        description: "The dish's cuisine, e.g. Italian, Japanese, Mexican. Empty string if unclear.",
      },
      category: {
        type: 'string',
        description: 'The menu course, e.g. Appetizer, Entree, Dessert. Empty string if unclear.',
      },
      ingredients: {
        type: 'array',
        items: { type: 'string' },
        description: "5-12 likely ingredients, each a short lowercase phrase (e.g. 'garlic', 'shrimp').",
      },
      method: {
        type: 'array',
        items: { type: 'string' },
        description: '3-8 short cooking steps, in order, plain language, one action per step.',
      },
      note: {
        type: 'string',
        description:
          "One short, optional aside a chef might leave for future reference, under 90 characters. Empty string if there's nothing worth saying.",
      },
    },
    required: ['name', 'cuisine', 'category', 'ingredients', 'method', 'note'],
  },
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

  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: 'ANTHROPIC_API_KEY is not configured on this project.' }, 500);
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        tools: [FILL_TOOL],
        tool_choice: { type: 'tool', name: 'fill_meal_details' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mediaType || 'image/png',
                  data: image.data,
                },
              },
              {
                type: 'text',
                text: `Photo of a dish, and the chef's own brief description: "${description.trim()}". Call fill_meal_details with your best-guess structured details for this dish.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return jsonResponse({ error: `AI request failed (${response.status}): ${errText}` }, 502);
    }

    const result = await response.json();
    const toolUse = (result.content || []).find((block) => block.type === 'tool_use' && block.name === 'fill_meal_details');
    if (!toolUse) {
      return jsonResponse({ error: 'AI response did not include structured details.' }, 502);
    }

    return jsonResponse(toolUse.input);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Unexpected error contacting the AI.' }, 500);
  }
});
