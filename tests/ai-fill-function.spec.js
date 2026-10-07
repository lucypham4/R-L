import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The ai-fill Edge Function asks a second model when the first is busy.
//
// It runs on Deno, which this suite doesn't have, so the function is bundled
// with esbuild (the same one Vite uses) and its handler called here with a
// stand-in for Deno and for fetch: no network, no key. What's pinned is the
// part that decides what the chef is told: a busy first model is answered by
// the fallback when there is one; and when there isn't, or that fails too, the
// failure the browser sees is still the first model's, so its retry logic
// (src/lib/aiFill.js) reads the right status.

const FUNCTION = fileURLToPath(new URL('../supabase/functions/ai-fill/index.ts', import.meta.url));

const DETAILS = {
  name: 'Bok choy chicken',
  date: '',
  description: 'A torched chicken thigh over garlicky bok choy.',
  summary: 'Torched chicken over bok choy.',
  cuisine: 'Japanese',
  category: 'Entree',
  ingredients: ['chicken thigh', 'bok choy'],
  method: ['Torch the skin.'],
  note: '',
};

const geminiOk = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(DETAILS) }] } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const geminiFails = (status, message = 'This model is currently experiencing high demand.') =>
  new Response(JSON.stringify({ error: { code: status, message, status: 'UNAVAILABLE' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let workdir;
let loads = 0;

test.beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'ai-fill-function-'));
});
test.afterAll(() => rmSync(workdir, { recursive: true, force: true }));

/**
 * Loads a fresh copy of the function under `env` and returns what it did for
 * one request: its response, and each model Gemini was asked for, in order.
 * `answers` is what each successive call to Gemini returns.
 */
async function ask(env, answers) {
  const bundle = await build({ entryPoints: [FUNCTION], bundle: true, format: 'esm', platform: 'neutral', write: false });
  const file = join(workdir, `ai-fill-${(loads += 1)}.mjs`);
  writeFileSync(file, bundle.outputFiles[0].text);

  let handler;
  const calls = [];
  const realFetch = globalThis.fetch;
  const realConsole = { warn: console.warn, error: console.error };
  globalThis.Deno = { env: { get: (key) => env[key] }, serve: (fn) => (handler = fn) };
  globalThis.fetch = async (url, init) => {
    calls.push({ model: /models\/([^:]+):/.exec(String(url))?.[1], body: init.body });
    return answers[calls.length - 1]();
  };
  console.warn = console.error = () => {};
  try {
    await import(pathToFileURL(file).href);
    const response = await handler(
      new Request('http://localhost/ai-fill', {
        method: 'POST',
        body: JSON.stringify({ notes: 'Chicken thigh, torched.', image: { data: 'aGVsbG8=', mediaType: 'image/png' } }),
      }),
    );
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.Deno;
    Object.assign(console, realConsole);
  }
}

const KEYED = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'primary-model' };
const WITH_FALLBACK = { ...KEYED, GEMINI_FALLBACK_MODEL: 'fallback-model' };

test.describe('ai-fill, when the first model is busy', () => {
  for (const status of [503, 429]) {
    test(`a ${status} goes to the fallback model, with the same request, and the chef never sees it`, async () => {
      const { status: code, body, calls } = await ask(WITH_FALLBACK, [() => geminiFails(status), geminiOk]);
      expect(code).toBe(200);
      expect(body.name).toBe(DETAILS.name);
      expect(calls.map((c) => c.model)).toEqual(['primary-model', 'fallback-model']);
      // The photo isn't re-sent from the phone and isn't re-encoded: it is the one request body.
      expect(calls[1].body).toBe(calls[0].body);
    });
  }

  test('with no fallback configured it is one try, and the failure is the first model’s', async () => {
    const { status, body, calls } = await ask(KEYED, [() => geminiFails(503)]);
    expect(status).toBe(502);
    expect(body.error).toMatch(/^AI request failed \(503\)/);
    expect(calls).toHaveLength(1);
  });

  test('a fallback that is busy too still reports the first model’s 503, which the browser retries', async () => {
    const { status, body, calls } = await ask(WITH_FALLBACK, [() => geminiFails(503), () => geminiFails(429, 'quota')]);
    expect(status).toBe(502);
    expect(body.error).toMatch(/^AI request failed \(503\)/);
    expect(calls.map((c) => c.model)).toEqual(['primary-model', 'fallback-model']);
  });

  test('a mistyped fallback (404) doesn’t hide the first model’s 503 behind a failure nothing retries', async () => {
    const { body } = await ask(WITH_FALLBACK, [() => geminiFails(503), () => geminiFails(404, 'model not found')]);
    expect(body.error).toMatch(/^AI request failed \(503\)/);
    expect(body.error).not.toMatch(/404|not found/);
  });

  test('the fallback is only for a busy model: a 404 or a 400 on the first one is not retried elsewhere', async () => {
    for (const status of [404, 400, 500]) {
      const { body, calls } = await ask(WITH_FALLBACK, [() => geminiFails(status)]);
      expect(body.error).toMatch(new RegExp(`^AI request failed \\(${status}\\)`));
      expect(calls).toHaveLength(1);
    }
  });

  test('a first model that answers never wakes the fallback', async () => {
    const { status, calls } = await ask(WITH_FALLBACK, [geminiOk]);
    expect(status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  test('a fallback named the same as the first isn’t asked twice', async () => {
    const { calls } = await ask({ ...KEYED, GEMINI_FALLBACK_MODEL: 'primary-model' }, [() => geminiFails(503)]);
    expect(calls).toHaveLength(1);
  });
});
