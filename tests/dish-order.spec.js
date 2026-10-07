import { test, expect } from './support/network';

// Sorting the gallery, and the chef's own order.
//
//   - The filter sheet has Sort by: Newest, Oldest or Custom. It's not a
//     filter, so it doesn't light the dot and Clear all leaves it.
//   - Holding a dish on the home screen and moving it drags it somewhere
//     else, and the gallery switches to Custom to keep it there. Held
//     still, the menu opens as before.
//   - A chef's order is saved to their profile, and their public page lays
//     the dishes out in it. A visitor can't drag them.

const photo = (fill) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${fill}"/></svg>`);

const dish = (id, name, cuisine, date) => ({
  id,
  name,
  cuisine,
  category: 'Main',
  date,
  serves: 2,
  photos: [photo('#5a8')],
  ingredients: [],
  method: [],
  description: `${name}, described.`,
  note: '',
});

const MEALS = [
  dish('m4', 'Beetroot', 'Nordic', '2026-09-24'),
  dish('m3', 'Cacio e pepe', 'Italian', '2026-09-18'),
  dish('m2', 'Charred leek', 'French', '2026-09-11'),
  dish('m1', 'Lamb tagine', 'Moroccan', '2026-09-04'),
];

const names = (page) => page.locator('.meal-card-name').allTextContents();

async function boot(page, { order } = {}) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: route.request().url().includes('/auth/v1/') ? '{}' : '[]' })
  );
  await page.addInitScript(
    ({ meals, order }) => {
      if (sessionStorage.getItem('booted')) return;
      sessionStorage.setItem('booted', '1');
      localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
      if (order) localStorage.setItem('staj-dish-order', JSON.stringify(order));
    },
    { meals: MEALS, order }
  );
  await page.goto('/');
  await expect(page.locator('.meal-card')).toHaveCount(MEALS.length);
}

async function sortBy(page, label) {
  await page.getByRole('button', { name: /^Open filters/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('tab', { name: label }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
}

async function center(page, name) {
  const box = await page.locator('.meal-card', { hasText: name }).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 3 };
}

/** Holds `from` until its menu opens, then drags it onto `to` and lets go. */
async function drag(page, from, to) {
  const a = await center(page, from);
  const b = await center(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await expect(page.getByRole('dialog', { name: from })).toBeVisible();
  await page.mouse.move(a.x + (b.x - a.x) / 2, a.y + (b.y - a.y) / 2, { steps: 4 });
  // The menu gives way as soon as the dish moves.
  await expect(page.getByRole('dialog', { name: from })).toHaveCount(0);
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
}

test.describe('sorting', () => {
  test('newest first to begin with, and oldest first on request', async ({ page }) => {
    await boot(page);
    expect(await names(page)).toEqual(['Beetroot', 'Cacio e pepe', 'Charred leek', 'Lamb tagine']);
    await sortBy(page, 'Oldest');
    expect(await names(page)).toEqual(['Lamb tagine', 'Charred leek', 'Cacio e pepe', 'Beetroot']);
  });

  test('is not a filter: no dot, and Clear all leaves it', async ({ page }) => {
    await boot(page);
    await sortBy(page, 'Oldest');
    await expect(page.locator('.gallery-filter-dot')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet.getByRole('button', { name: 'Clear all' })).toHaveCount(0);
    await expect(sheet.getByRole('tab', { name: 'Oldest' })).toHaveAttribute('aria-selected', 'true');
  });

  test('is remembered on this device', async ({ page }) => {
    await boot(page);
    await sortBy(page, 'Oldest');
    await page.reload();
    await expect(page.locator('.meal-card')).toHaveCount(MEALS.length);
    expect(await names(page)).toEqual(['Lamb tagine', 'Charred leek', 'Cacio e pepe', 'Beetroot']);
  });

  test('Custom follows the saved order, with dishes it doesn’t name yet first', async ({ page }) => {
    await boot(page, { order: ['m1', 'm3', 'm2'] });
    await sortBy(page, 'Custom');
    expect(await names(page)).toEqual(['Beetroot', 'Lamb tagine', 'Cacio e pepe', 'Charred leek']);
  });
});

test.describe('dragging a dish', () => {
  test('moves it, switches to Custom and remembers the order', async ({ page }) => {
    await boot(page);
    await drag(page, 'Beetroot', 'Charred leek');
    expect(await names(page)).toEqual(['Cacio e pepe', 'Charred leek', 'Beetroot', 'Lamb tagine']);

    await page.getByRole('button', { name: 'Open filters' }).click();
    await expect(page.getByRole('tab', { name: 'Custom' })).toHaveAttribute('aria-selected', 'true');

    await page.reload();
    await expect(page.locator('.meal-card')).toHaveCount(MEALS.length);
    expect(await names(page)).toEqual(['Cacio e pepe', 'Charred leek', 'Beetroot', 'Lamb tagine']);
  });

  test('from oldest first keeps the order on screen, with the one dish moved', async ({ page }) => {
    await boot(page);
    await sortBy(page, 'Oldest');
    await drag(page, 'Beetroot', 'Lamb tagine');
    expect(await names(page)).toEqual(['Beetroot', 'Lamb tagine', 'Charred leek', 'Cacio e pepe']);
  });

  test('doesn’t open the dish it was dropped on', async ({ page }) => {
    await boot(page);
    await drag(page, 'Beetroot', 'Cacio e pepe');
    await expect(page.locator('.dish-index')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('meal')).toBeNull();
  });

  test('while filtered, keeps the hidden dishes where they were', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Open filters' }).click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    for (const cuisine of ['Nordic', 'French', 'Moroccan']) await sheet.getByRole('button', { name: cuisine }).click();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    // Cacio e pepe, second of the four, is hidden.
    expect(await names(page)).toEqual(['Beetroot', 'Charred leek', 'Lamb tagine']);
    await drag(page, 'Lamb tagine', 'Charred leek');
    expect(await names(page)).toEqual(['Beetroot', 'Lamb tagine', 'Charred leek']);

    await page.getByRole('button', { name: /^Open filters/ }).click();
    await sheet.getByRole('button', { name: 'Clear all' }).click();
    await sheet.getByRole('button', { name: 'Close' }).click();
    // Lamb tagine went in after Beetroot, the dish before it on screen;
    // Cacio e pepe kept its place after Beetroot's.
    expect(await names(page)).toEqual(['Beetroot', 'Lamb tagine', 'Cacio e pepe', 'Charred leek']);
  });
});

test.describe('stepping through the open dish', () => {
  const NAME = '.dish-hero-title .dish-name-in';

  async function step(page, name, label) {
    await page.getByRole('button', { name }).click();
    await expect(page.locator('.dish-index')).toHaveText(label);
  }

  test('follows the custom order, numbered from the first dish in it', async ({ page }) => {
    await boot(page, { order: ['m2', 'm4', 'm1', 'm3'] });
    await sortBy(page, 'Custom');
    await page.locator('.meal-card', { hasText: 'Beetroot' }).click();
    await expect(page.locator('.dish-index')).toHaveText('No. 2 of 4');

    await step(page, 'Next dish', 'No. 3 of 4');
    await expect(page.locator(NAME)).toHaveText('Lamb tagine');
    await step(page, 'Next dish', 'No. 4 of 4');
    await expect(page.locator(NAME)).toHaveText('Cacio e pepe');
    // And round from the last to the first.
    await step(page, 'Next dish', 'No. 1 of 4');
    await expect(page.locator(NAME)).toHaveText('Charred leek');
    await step(page, 'Previous dish', 'No. 4 of 4');
    await expect(page.locator(NAME)).toHaveText('Cacio e pepe');
  });

  test('sorted by date, still goes in the order the dishes were made', async ({ page }) => {
    await boot(page, { order: ['m2', 'm4', 'm1', 'm3'] });
    await page.locator('.meal-card', { hasText: 'Beetroot' }).click();
    // The newest, so the highest number, as it has always been.
    await expect(page.locator('.dish-index')).toHaveText('No. 4 of 4');
    await step(page, 'Previous dish', 'No. 3 of 4');
    await expect(page.locator(NAME)).toHaveText('Cacio e pepe');
  });
});

test.describe('a chef’s order', () => {
  const USER = {
    id: 'chef-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'ana@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  const CHEF = { id: USER.id, slug: 'ana', display_name: 'Ana', page_theme: 'light', dish_order: [] };

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

  async function bootChef(page, { signedIn, chef = CHEF, path = '/', patch } = {}) {
    const patches = [];
    await page.route('**stub.supabase.co/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.startsWith('/auth/v1/')) return json(url.pathname === '/auth/v1/user' ? USER : {});
      if (url.pathname === '/rest/v1/chefs') {
        if (req.method() === 'PATCH') {
          patches.push(req.postDataJSON());
          if (patch) return patch(json);
          return json({ ...chef, ...req.postDataJSON() });
        }
        return json([chef]);
      }
      if (url.pathname === '/rest/v1/meals') return json(MEALS.map((m) => ({ ...m, user_id: USER.id })));
      return json([]);
    });
    await page.addInitScript((stored) => {
      if (stored) localStorage.setItem('sb-stub-auth-token', JSON.stringify(stored));
    }, signedIn ? session() : null);
    await page.goto(path);
    await expect(page.locator('.meal-card')).toHaveCount(MEALS.length);
    return patches;
  }

  test('is saved to their profile', async ({ page }) => {
    const patches = await bootChef(page, { signedIn: true });
    await drag(page, 'Lamb tagine', 'Beetroot');
    expect(await names(page)).toEqual(['Lamb tagine', 'Beetroot', 'Cacio e pepe', 'Charred leek']);
    await expect.poll(() => patches).toEqual([{ dish_order: ['m1', 'm4', 'm3', 'm2'] }]);
  });

  test('goes back, and says why, when it can’t be saved', async ({ page }) => {
    await bootChef(page, {
      signedIn: true,
      patch: (json) =>
        json({ code: 'PGRST204', message: "Could not find the 'dish_order' column of 'chefs' in the schema cache" }, 400),
    });
    await drag(page, 'Lamb tagine', 'Beetroot');
    await expect(page.getByRole('alert')).toHaveText(
      "This app isn't set up to save the order of your dishes yet, so nothing was saved. Try again once it is."
    );
    expect(await names(page)).toEqual(['Beetroot', 'Cacio e pepe', 'Charred leek', 'Lamb tagine']);
  });

  test('lays out their public page, which a visitor can’t rearrange', async ({ page }) => {
    await bootChef(page, { path: '/ana', chef: { ...CHEF, dish_order: ['m2', 'm4', 'm1', 'm3'] } });
    expect(await names(page)).toEqual(['Charred leek', 'Beetroot', 'Lamb tagine', 'Cacio e pepe']);

    const a = await center(page, 'Charred leek');
    const b = await center(page, 'Cacio e pepe');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.meal-card-wrap-dragging')).toHaveCount(0);
    expect(await names(page)).toEqual(['Charred leek', 'Beetroot', 'Lamb tagine', 'Cacio e pepe']);
  });
});
