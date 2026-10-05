// Stands in for Supabase so the app can be pointed at it and made to fail the
// way it does when Gemini is overloaded: ai-fill answers HTTP 502 with
// "AI request failed (503): ..." in the body, exactly as the real Edge
// Function does. The first FAIL ai-fill requests fail; the rest succeed.
//
//   FAIL=2 node scripts/ai-stub.mjs
//   VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=stub npm run dev
//
//   FAIL=2  (default) the first try and the automatic retry both fail, so the
//                     notice shows; "Try again" then succeeds
//   FAIL=1            the automatic retry rescues it, so no notice at all
//   FAIL=99           every request fails
//   PORT=54321        where to listen (set it if `supabase start` has that one)
//
// Auth and data requests are answered empty, so the app settles as a guest.
// Each ai-fill request is logged with a timestamp, so the pause before the
// automatic retry shows. FAIL counts requests since the stub started; restart
// it between runs. README.md, "Testing AI failures", has the walkthrough.
import { createServer } from 'node:http';

const FAIL = Number(process.env.FAIL ?? 2);
const PORT = Number(process.env.PORT ?? 54321);
let aiFillCalls = 0;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

function json(res, status, body) {
  res.writeHead(status, { ...cors, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  if (req.url.includes('/functions/v1/ai-fill')) {
    aiFillCalls += 1;
    const failing = aiFillCalls <= FAIL;
    console.log(`${new Date().toISOString().slice(11, 23)}  ai-fill #${aiFillCalls} -> ${failing ? '503' : '200'}`);
    if (failing) {
      return json(res, 502, {
        error:
          'AI request failed (503): { "error": { "code": 503, "message": "This model is currently experiencing high demand.", "status": "UNAVAILABLE" } }',
      });
    }
    return json(res, 200, {
      name: 'Bok choy chicken',
      date: '2025-01-02',
      description: 'A torched sous vide chicken thigh over garlicky bok choy.',
      summary: 'Torched chicken over garlicky bok choy.',
      cuisine: 'Japanese',
      category: 'Entree',
      ingredients: ['chicken thigh', 'bok choy', 'garlic', 'mirin'],
      method: ['Sous vide the chicken.', 'Torch the skin.', 'Wilt the bok choy.'],
      note: 'Dry the skin well before torching.',
    });
  }

  json(res, 200, req.url.includes('/auth/v1/') ? {} : []);
}).listen(PORT, () => console.log(`stub Supabase on http://localhost:${PORT}  (FAIL=${FAIL})`));
