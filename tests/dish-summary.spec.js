import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// The line on a dish's resting card is a whole sentence written to fit
// it, never the description clamped to two lines and cut off. See
// summaryOf in src/lib/meal.js for where it comes from.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

const LONG_FIRST_SENTENCE =
  'Leeks charred over a low bed of coals until the outer layers blacken, then peeled back to the sweet centre. Finished with brown butter.';

const dish = (id, date, extra) => ({
  id,
  name: `Dish ${id}`,
  cuisine: 'French',
  category: 'Starter',
  date,
  serves: 2,
  photos: [],
  ingredients: ['leek', 'brown butter', 'hazelnut'],
  method: ['Char the leeks.'],
  description: 'A plate built on smoke.',
  note: '',
  ...extra,
});

const USER = {
  id: 'chef-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

function session() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.round(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, exp })}.sig`,
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: exp,
    token_type: 'bearer',
    user: USER,
  };
}

/**
 * Boots with `meals`, as a guest or signed in. `summarize` answers the
 * summarize-dish function; every request is kept in `calls`.
 */
async function boot(page, meals, { signedIn = false, summarize, aiFill, path = '/' } = {}) {
  const calls = [];
  await page.route('**stub.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push({ method: req.method(), path: url.pathname, search: url.search, body: req.postDataJSON?.() ?? null });
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/functions/v1/summarize-dish') return summarize ? summarize(route, json) : json({ error: 'Not deployed.' }, 404);
    if (url.pathname === '/functions/v1/ai-fill') return aiFill ? json(aiFill) : json({ error: 'Not deployed.' }, 404);
    if (url.pathname === '/auth/v1/user') return json(USER);
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    if (url.pathname === '/rest/v1/chefs') return json([{ id: USER.id, slug: 'ana', display_name: 'Ana', page_theme: 'light' }]);
    if (url.pathname === '/rest/v1/meals') {
      if (req.method() === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        return json({ ...meals.find((m) => m.id === id), ...req.postDataJSON(), user_id: USER.id });
      }
      return json(meals.map((m) => ({ ...m, user_id: USER.id })));
    }
    return json([]);
  });
  await page.addInitScript(
    ({ meals, stored }) => {
      if (!stored) localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
      if (stored) localStorage.setItem('sb-stub-auth-token', JSON.stringify(stored));
    },
    { meals, stored: signedIn ? session() : null }
  );
  await page.goto(path);
  return calls;
}

async function openFirstDish(page) {
  await page.locator('.meal-card').first().click();
  await expect(page.locator('.dish')).toBeVisible();
}

const lede = (page) => page.locator('.dish-lede');

/** Whether the card's line is shown whole: no clamp, nothing overflowing. */
const shownWhole = (page) =>
  lede(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    return cs.webkitLineClamp === 'none' && el.scrollHeight <= el.clientHeight + 1;
  });

test.describe('the line on the resting card', () => {
  test('is the summary written for it, and the recipe carries the description', async ({ page }) => {
    await boot(page, [
      dish('m1', '2026-09-11', {
        summary: 'Charred leeks under brown butter and hazelnut.',
        description: LONG_FIRST_SENTENCE,
      }),
    ]);
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('Charred leeks under brown butter and hazelnut.');
    expect(await shownWhole(page)).toBe(true);
    // Two lines at this width, as the budget is meant to guarantee.
    const lines = await lede(page).evaluate((el) => Math.round(el.clientHeight / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines).toBeLessThanOrEqual(2);
    await expect(page.locator('.dish-description')).toHaveText(LONG_FIRST_SENTENCE);
  });

  test('without one, is the description’s first sentence when that fits', async ({ page }) => {
    await boot(page, [
      dish('m1', '2026-09-11', { description: 'A plate built on smoke. The leeks go on the coals first, then the rest.' }),
    ]);
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('A plate built on smoke.');
    expect(await shownWhole(page)).toBe(true);
    await expect(page.locator('.dish-description')).toHaveText(
      'A plate built on smoke. The leeks go on the coals first, then the rest.'
    );
  });

  test('says nothing twice: a description that fits whole isn’t repeated below', async ({ page }) => {
    await boot(page, [dish('m1', '2026-09-11')]);
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('A plate built on smoke.');
    await expect(page.locator('.dish-description')).toHaveCount(0);
  });

  test('never cuts a long first sentence: it makes one from the ingredients', async ({ page }) => {
    await boot(page, [dish('m1', '2026-09-11', { description: LONG_FIRST_SENTENCE })]);
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('Leek with brown butter and hazelnut.');
    expect(await shownWhole(page)).toBe(true);
    await expect(page.locator('.dish-description')).toHaveText(LONG_FIRST_SENTENCE);
  });
});

test.describe('a summary for a meal logged before them', () => {
  test('is written the first time the dish opens, and kept on this device', async ({ page }) => {
    let asked = null;
    const calls = await boot(page, [dish('m1', '2026-09-11', { description: LONG_FIRST_SENTENCE })], {
      summarize: (route, json) => {
        asked = route.request().postDataJSON();
        return json({ summary: 'Coal-charred leeks with brown butter.' });
      },
    });
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('Coal-charred leeks with brown butter.');
    expect(asked).toMatchObject({ description: LONG_FIRST_SENTENCE, ingredients: ['leek', 'brown butter', 'hazelnut'] });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('meal-diary-local-meals')));
    expect(stored[0].summary).toBe('Coal-charred leeks with brown butter.');

    // Once is enough: reopening doesn't ask again.
    await page.getByRole('button', { name: 'Back' }).click();
    await openFirstDish(page);
    expect(calls.filter((c) => c.path === '/functions/v1/summarize-dish')).toHaveLength(1);
  });

  test('is saved to a signed-in chef’s meal', async ({ page }) => {
    const calls = await boot(page, [dish('m1', '2026-09-11', { description: LONG_FIRST_SENTENCE })], {
      signedIn: true,
      summarize: (route, json) => json({ summary: 'Coal-charred leeks with brown butter.' }),
    });
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('Coal-charred leeks with brown butter.');
    await expect.poll(() => calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/meals')?.body).toEqual({
      summary: 'Coal-charred leeks with brown butter.',
    });
    expect(calls.find((c) => c.method === 'PATCH').search).toContain('id=eq.m1');
  });

  test('isn’t asked for when the card already has a whole sentence', async ({ page }) => {
    const calls = await boot(page, [dish('m1', '2026-09-11')], { summarize: (route, json) => json({ summary: 'x.' }) });
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('A plate built on smoke.');
    await page.waitForTimeout(300);
    expect(calls.filter((c) => c.path === '/functions/v1/summarize-dish')).toHaveLength(0);
  });

  test('isn’t asked for on a public page, whose readers can’t save it', async ({ page }) => {
    const calls = await boot(page, [dish('m1', '2026-09-11', { description: LONG_FIRST_SENTENCE })], {
      path: '/ana',
      summarize: (route, json) => json({ summary: 'Coal-charred leeks with brown butter.' }),
    });
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('Leek with brown butter and hazelnut.');
    await page.waitForTimeout(300);
    expect(calls.filter((c) => c.path === '/functions/v1/summarize-dish')).toHaveLength(0);
  });

  test('leaves the card as it was if the AI can’t write one', async ({ page }) => {
    const calls = await boot(page, [dish('m1', '2026-09-11', { description: LONG_FIRST_SENTENCE })], {
      summarize: (route, json) => json({ error: 'GEMINI_API_KEY is not configured on this project.' }, 500),
    });
    await openFirstDish(page);
    await page.waitForTimeout(300);
    await expect(lede(page)).toHaveText('Leek with brown butter and hazelnut.');
    // Not a busy model, so not asked again.
    await page.waitForTimeout(1800);
    expect(calls.filter((c) => c.path === '/functions/v1/summarize-dish')).toHaveLength(1);
  });

  test('is asked for again when the model is busy, as the AI fill is', async ({ page }) => {
    let asks = 0;
    await boot(page, [dish('m1', '2026-09-11', { description: LONG_FIRST_SENTENCE })], {
      summarize: (route, json) => {
        asks += 1;
        return asks < 3
          ? json({ error: 'AI request failed (503): { "error": { "code": 503, "status": "UNAVAILABLE" } }' }, 502)
          : json({ summary: 'Coal-charred leeks with brown butter.' });
      },
    });
    await openFirstDish(page);
    // The pauses are 1.5s and 3s; the card keeps its own line until it lands.
    await expect(lede(page)).toHaveText('Coal-charred leeks with brown butter.', { timeout: 10_000 });
    expect(asks).toBe(3);
  });

  test('says nothing about it when the model stays busy: no raw reply, no error, the card as it was', async ({ page }) => {
    let asks = 0;
    await boot(page, [dish('m1', '2026-09-11', { description: LONG_FIRST_SENTENCE })], {
      summarize: (route, json) => {
        asks += 1;
        return json({ error: 'AI request failed (503): { "error": { "code": 503, "status": "UNAVAILABLE" } }' }, 502);
      },
    });
    await openFirstDish(page);
    await expect.poll(() => asks, { timeout: 10_000 }).toBe(3);
    await page.waitForTimeout(500);
    await expect(lede(page)).toHaveText('Leek with brown butter and hazelnut.');
    const shown = await page.locator('body').innerText();
    expect(shown).not.toMatch(/AI request failed|UNAVAILABLE|couldn.t/i);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('adding a meal', () => {
  const AI_FILL = {
    name: 'Charred leek, hazelnut',
    date: '',
    description: LONG_FIRST_SENTENCE,
    summary: 'Charred leeks under brown butter and hazelnut.',
    cuisine: 'French',
    category: 'Starter',
    ingredients: ['leek', 'brown butter', 'hazelnut'],
    method: ['Char the leeks.'],
    note: '',
  };

  async function toStep3(page) {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.setInputFiles('#photo', DISH_PHOTO);
    await page.getByRole('button', { name: 'Use photo' }).click();
    await page.locator('.add-meal-next').click();
    await page.locator('textarea').first().fill('Leeks on the coals, brown butter, hazelnuts.');
    await page.locator('.add-meal-next').click();
    await expect(page.locator('.add-meal-progress')).toHaveText(/Step 3 of 3/);
  }

  test('the AI fill writes the summary, the chef can change it, and the card shows it', async ({ page }) => {
    await boot(page, [], { aiFill: AI_FILL });
    await toStep3(page);
    const field = page.getByLabel('Summary');
    await expect(field).toHaveValue(AI_FILL.summary);
    await field.fill('Leeks, coals, brown butter and hazelnut.');
    await page.locator('#meal-date').fill('2026-09-26');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.locator('.meal-card')).toHaveCount(1);
    await openFirstDish(page);
    await expect(lede(page)).toHaveText('Leeks, coals, brown butter and hazelnut.');
  });

  test('a summary too long for the card isn’t offered, rather than cut', async ({ page }) => {
    await boot(page, [], {
      aiFill: { ...AI_FILL, summary: 'Leeks charred over coals, peeled to the sweet centre and finished with butter.' },
    });
    await toStep3(page);
    // Step 3 opens at once and fills in behind the sheen; wait for the
    // answer to land (the name is the proof) before asserting the summary
    // was left out, or this passes before the AI has said anything.
    await expect(page.getByLabel('Meal name')).toHaveValue(AI_FILL.name);
    await expect(page.getByLabel('Summary')).toHaveValue('');
  });
});
