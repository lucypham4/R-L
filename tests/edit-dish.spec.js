import { test, expect } from './support/network';

// Editing a dish. An Edit button sits beside Share in the dish's bar, and
// opens the recipe card (the last step of adding a dish) pre-filled, over
// the dish. It's the chef's own: a public page, which is someone else's
// archive, has no Edit.
//
// Like Share, it lives in the bar, which stays where it is as the recipe
// scrolls underneath.

const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle cx="200" cy="200" r="180" fill="#b56"/></svg>');

const STEPS = [
  'Knead flour, milk, yeast, sugar, egg, and butter into a smooth yeast dough.',
  'Let dough proof until doubled in volume, then divide into round buns.',
  'Bake at 350°F until soft and golden brown, then cool completely.',
  'Whip heavy cream with condensed milk and sugar until thick and fluffy.',
];

const dish = (id, name, date, extra) => ({
  id,
  name,
  cuisine: 'American',
  category: 'Dessert',
  date,
  serves: 2,
  photos: [PHOTO],
  ingredients: ['black beans', 'cocoa'],
  method: [...STEPS, ...STEPS],
  description: 'Fudgy black bean protein brownie cups.',
  summary: 'Fudgy black bean protein brownie cups.',
  note: 'Salt generously.',
  ...extra,
});

const MEALS = [dish('m2', 'Salted black bean brownie cups', '2026-10-04'), dish('m1', 'Cacio e pepe', '2026-09-10')];

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
 * Boots with MEALS, as a guest (kept in this browser), signed in (kept in the
 * stubbed cloud) or on a public page. `saves` is whether the server's update
 * actually changes a row, as it does once summary-migration.sql has given
 * chefs an update policy; false is an empty success. Every update is kept in
 * `updates`.
 */
async function boot(page, { signedIn = false, path = '/', saves = true } = {}) {
  const updates = [];
  await page.route('**stub.supabase.co/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return json(USER);
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    if (url.pathname === '/rest/v1/chefs') return json([{ id: USER.id, slug: 'ana', display_name: 'Ana', page_theme: 'light' }]);
    if (url.pathname === '/rest/v1/meals') {
      if (req.method() === 'PATCH') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const body = req.postDataJSON();
        updates.push({ id, body });
        return json(saves ? [{ ...MEALS.find((m) => m.id === id), ...body, user_id: USER.id }] : []);
      }
      return json(MEALS.map((m) => ({ ...m, user_id: USER.id })));
    }
    return json([]);
  });
  await page.addInitScript(
    ({ meals, stored }) => {
      if (stored) localStorage.setItem('sb-stub-auth-token', JSON.stringify(stored));
      else if (!localStorage.getItem('meal-diary-local-meals')) localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
    },
    { meals: MEALS, stored: signedIn ? session() : null }
  );
  await page.goto(path);
  await expect(page.locator('.meal-card')).toHaveCount(2);
  return updates;
}

async function openDish(page, name) {
  await page.locator('.meal-card', { hasText: name }).click();
  await expect(page.locator('.dish')).toBeVisible();
  // Let the entrance finish: its `translate` would otherwise show up in
  // every bounding box read below.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}

const edit = (page) => page.locator('.dish-bar').getByRole('button', { name: 'Edit', exact: true });
const share = (page) => page.locator('.dish-bar').getByRole('button', { name: 'Share', exact: true });
const form = (page) => page.getByRole('dialog', { name: /^Edit / });

test.describe('the Edit button', () => {
  test('sits beside Share in the bar', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');

    const e = await edit(page).boundingBox();
    const s = await share(page).boundingBox();
    // Same row, the same height, Edit to the left with a gap before Share.
    expect(e.y).toBeCloseTo(s.y, 0);
    expect(e.height).toBeCloseTo(s.height, 0);
    expect(e.x + e.width).toBeLessThan(s.x);
    expect(s.x - (e.x + e.width)).toBeLessThan(16);
    // Both inside the view, and clear of the "No. 2 of 2" between Back and them.
    const index = await page.locator('.dish-index').boundingBox();
    const view = await page.locator('.dish').boundingBox();
    expect(e.x).toBeGreaterThan(index.x + index.width);
    expect(s.x + s.width).toBeLessThanOrEqual(view.x + view.width);
  });

  test('holds still, like Share, while the recipe scrolls under it', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');

    const rects = () => Promise.all([edit(page).boundingBox(), share(page).boundingBox()]);
    const before = await rects();

    // Resting, open, then collapsed: all the way down the recipe.
    for (const to of ['open', 'end']) {
      await page.evaluate(async (where) => {
        const scroller = document.querySelector('.dish-scroller');
        scroller.style.scrollSnapType = 'none';
        scroller.scrollTop = where === 'open' ? document.querySelector('.dish-sheet').offsetTop : scroller.scrollHeight;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, to);
      expect(await rects()).toEqual(before);
      await expect(edit(page)).toBeVisible();
      await expect(edit(page)).toBeEnabled();
    }
  });

  test('is the same size and weight as Share', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    const look = (locator) =>
      locator.evaluate((el) => {
        const cs = getComputedStyle(el);
        return [cs.font, cs.color, cs.borderTopWidth, cs.borderTopLeftRadius, cs.paddingTop, cs.paddingLeft];
      });
    expect(await look(edit(page))).toEqual(await look(share(page)));
  });

  test('isn’t on a public page, which is someone else’s archive', async ({ page }) => {
    await boot(page, { path: '/ana' });
    await openDish(page, 'Salted black bean');
    await expect(share(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  });
});

test.describe('editing a dish', () => {
  test('opens the recipe card, filled in, over the dish', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    await edit(page).click();

    await expect(form(page)).toBeVisible();
    // One screen, not a three-step wizard.
    await expect(page.locator('.add-meal-progress')).toHaveCount(0);
    await expect(page.locator('.add-meal-title')).toHaveText('Edit your recipe card');
    await expect(page.locator('#meal-name')).toHaveValue('Salted black bean brownie cups');
    await expect(page.locator('#meal-date')).toHaveValue('2026-10-04');
    await expect(page.locator('#meal-serves')).toHaveValue('2');
    await expect(page.locator('#meal-description')).toHaveValue('Fudgy black bean protein brownie cups.');
    await expect(page.locator('#meal-summary')).toHaveValue('Fudgy black bean protein brownie cups.');
    await expect(page.locator('#meal-method')).toHaveValue([...STEPS, ...STEPS].join('\n'));
    await expect(page.locator('#meal-note')).toHaveValue('Salt generously.');
    // The dish's own cuisine and category are picked, even though neither is
    // one of the pickers' starting bubbles ("American" isn't).
    await expect(page.locator('.bubble-selected')).toHaveText(['Dessert', 'American']);
    // Saving isn't the red button: that's for finishing a new dish.
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveClass(/btn-primary/);
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('saves a guest’s changes to this browser, photos untouched', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    await edit(page).click();

    await page.locator('#meal-name').fill('Salted black bean brownies');
    await page.locator('#meal-serves').fill('');
    await page.locator('#meal-note').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // Back on the dish, which now says the new name, and nothing of serves.
    await expect(form(page)).toHaveCount(0);
    await expect(page.locator('.dish-hero-title')).toContainText('Salted black bean brownies');
    await expect(page.locator('.dish-peek-facts')).not.toContainText(/Serves/);
    // Focus goes back to the button that opened the form.
    await expect(edit(page)).toBeFocused();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('meal-diary-local-meals')));
    const meal = saved.find((m) => m.id === 'm2');
    expect(meal).toMatchObject({ name: 'Salted black bean brownies', serves: null, note: '', photos: [PHOTO], cuisine: 'American' });
    // The other dish is as it was.
    expect(saved.find((m) => m.id === 'm1').name).toBe('Cacio e pepe');

    await page.reload();
    await expect(page.locator('.meal-card', { hasText: 'Salted black bean brownies' })).toBeVisible();
  });

  test('a changed date moves the dish along the shelf', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    await expect(page.locator('.dish-index')).toHaveText('No. 2 of 2');
    await edit(page).click();
    await page.locator('#meal-date').fill('2026-08-01');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(form(page)).toHaveCount(0);
    // Still the dish that was open, now the older of the two.
    await expect(page.locator('.dish-hero-title')).toContainText('Salted black bean brownie cups');
    await expect(page.locator('.dish-index')).toHaveText('No. 1 of 2');
  });

  test('won’t save a dish without a name', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    await edit(page).click();
    await page.locator('#meal-name').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('A name is required')).toBeVisible();
    await expect(form(page)).toBeVisible();
  });

  test('Cancel changes nothing', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    await edit(page).click();
    await page.locator('#meal-name').fill('Something else');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(form(page)).toHaveCount(0);
    await expect(page.locator('.dish')).toBeVisible();
    await expect(page.locator('.dish-hero-title')).toContainText('Salted black bean brownie cups');
    await expect(edit(page)).toBeFocused();
  });

  test('keys typed into the form don’t reach the dish underneath', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    await expect(page.locator('.dish-index')).toHaveText('No. 2 of 2');
    await edit(page).click();

    // Arrow keys move the caret in a field; they mustn't step to the next dish.
    await page.locator('#meal-name').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.dish-index')).toHaveText('No. 2 of 2');

    // Escape closes the form, and only the form.
    await page.keyboard.press('Escape');
    await expect(form(page)).toHaveCount(0);
    await expect(page.locator('.dish')).toBeVisible();
    await expect(page.locator('.dish-hero-title')).toContainText('Salted black bean brownie cups');

    // With the form gone the dish answers its keys again.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.dish-index')).toHaveText('No. 1 of 2');
  });

  test('leaves the page locked, as the dish had it, once the form is gone', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    await edit(page).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.getByRole('button', { name: 'Back' }).click();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('the browser’s back button takes the form and the dish with it', async ({ page }) => {
    await boot(page);
    await openDish(page, 'Salted black bean');
    await edit(page).click();
    await expect(form(page)).toBeVisible();
    await page.goBack();
    await expect(form(page)).toHaveCount(0);
    await expect(page.locator('.dish')).toHaveCount(0);
  });
});

test.describe('editing a dish in a chef’s account', () => {
  test('updates that dish, blanks and all, and leaves its photos alone', async ({ page }) => {
    const updates = await boot(page, { signedIn: true });
    await openDish(page, 'Salted black bean');
    await edit(page).click();

    await page.locator('#meal-name').fill('Salted black bean brownies');
    await page.locator('#meal-summary').fill('');
    await page.locator('#meal-serves').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(form(page)).toHaveCount(0);
    await expect(page.locator('.dish-hero-title')).toContainText('Salted black bean brownies');
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('m2');
    // A cleared summary and serves are sent as cleared, not left out.
    expect(updates[0].body).toMatchObject({ name: 'Salted black bean brownies', summary: '', serves: null, note: 'Salt generously.' });
    expect(updates[0].body).not.toHaveProperty('photos');
    expect(updates[0].body).not.toHaveProperty('user_id');
  });

  test('says so, and keeps the form, when the server changed nothing', async ({ page }) => {
    // Row-level security turns an update no policy allows into an empty
    // success. The dish must not look saved.
    await boot(page, { signedIn: true, saves: false });
    await openDish(page, 'Salted black bean');
    await edit(page).click();
    await page.locator('#meal-name').fill('Salted black bean brownies');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByText(/Couldn.t save your changes/)).toBeVisible();
    await expect(form(page)).toBeVisible();
    await expect(page.locator('#meal-name')).toHaveValue('Salted black bean brownies');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.dish-hero-title')).toContainText('Salted black bean brownie cups');
  });
});
