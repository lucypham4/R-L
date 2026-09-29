import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';
import { findSquareCorners } from './support/corners';

// No straight corners, anywhere. Every screen the app can show is visited
// here and measured for a visible box with a square corner: a fill, a
// border, a shadow or a photo. See docs/design-system/shape.md.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

const photo = (fill) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${fill}"/></svg>`);

const dish = (id, name, date, fill, extra = {}) => ({
  id,
  name,
  cuisine: 'French',
  category: 'Main',
  date,
  serves: 2,
  photos: [photo(fill)],
  ingredients: ['leek', 'brown butter', 'hazelnut'],
  method: ['Char the leeks over coals.', 'Peel back to the sweet centre.', 'Spoon over the butter.'],
  description: 'A plate built on smoke.',
  note: 'Keep the coals low.',
  ...extra,
});

const MEALS = [
  dish('m3', 'Beetroot, horseradish', '2026-09-24', '#b56', {
    photos: [photo('#b56'), photo('#5a8')],
    method: Array.from({ length: 8 }, (_, i) => `Step ${i + 1}, long enough to take a line or two on a phone.`),
  }),
  dish('m2', 'Cacio e pepe', '2026-09-18', '#5a8'),
  dish('m1', 'Charred leek', '2026-09-11', '#58c'),
];

const USER = {
  id: 'chef-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const CHEF = { id: USER.id, slug: 'ana', display_name: 'Ana', page_theme: 'light' };

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
 * Boots the app. `signedIn` restores a session from storage; `chef` is
 * the profile row, or null for an account that hasn't chosen a page yet;
 * `tour` leaves the welcome tour unseen.
 */
async function boot(page, { meals = MEALS, signedIn = false, chef = CHEF, tour = false, path = '/' } = {}) {
  await page.route('**stub.supabase.co/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return json(USER);
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    if (url.pathname === '/rest/v1/chefs') {
      if (req.method() === 'POST') return json({ ...CHEF, ...req.postDataJSON() }, 201);
      return json(chef ? [chef] : []);
    }
    if (url.pathname === '/rest/v1/meals') return json(meals.map((m) => ({ ...m, user_id: USER.id })));
    if (url.pathname.startsWith('/functions/')) return json({ error: 'Not deployed.' }, 500);
    return json([]);
  });
  await page.addInitScript(
    ({ meals, stored, tour }) => {
      if (!tour) {
        localStorage.setItem('onboarding-seen-local', '1');
        localStorage.setItem('onboarding-seen-chef-1', '1');
      }
      localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
      if (stored) localStorage.setItem('sb-stub-auth-token', JSON.stringify(stored));
    },
    { meals, stored: signedIn ? session() : null, tour }
  );
  await page.goto(path);
}

const settle = (page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));

/** Asserts the screen has no square corners, naming it in the failure. */
async function expectRounded(page, screen) {
  await settle(page);
  // The share card is drawn off-screen to be saved as an image; its edges
  // are that image's edges.
  const corners = await findSquareCorners(page, { frames: ['.share-card'] });
  expect(corners, `square corners on ${screen}`).toEqual([]);
}

test.describe('no square corners', () => {
  test('the gallery, its sheets and edit mode', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.meal-card')).toHaveCount(3);
    await expectRounded(page, 'the gallery');

    await page.getByRole('button', { name: 'Open filters' }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await page.locator('.filter-sheet button', { hasText: 'French' }).first().click();
    await expectRounded(page, 'the filter sheet');
    await page.getByRole('button', { name: 'Close' }).click();
    await expectRounded(page, 'the gallery, filtered');

    const card = await page.locator('.meal-card').first().boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 3);
    await page.mouse.down();
    await expect(page.getByRole('dialog', { name: MEALS[0].name })).toBeVisible();
    await page.mouse.up();
    await expectRounded(page, 'the action sheet');
    await page.getByRole('button', { name: 'Edit gallery' }).click();
    await expectRounded(page, 'edit mode');
  });

  test('an empty gallery', async ({ page }) => {
    await boot(page, { meals: [] });
    await expect(page.getByText('Add your first dish')).toBeVisible();
    await expectRounded(page, 'the empty gallery');
  });

  test('the gallery and a dish on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await boot(page);
    await expect(page.locator('.meal-card')).toHaveCount(3);
    await expectRounded(page, 'the wide gallery');
    await page.locator('.meal-card').first().click();
    await expect(page.locator('.dish')).toBeVisible();
    await expectRounded(page, 'the floating dish');
  });

  test('a dish at each of its rests', async ({ page }) => {
    await boot(page);
    await page.locator('.meal-card').first().click();
    await expect(page.locator('.dish')).toBeVisible();
    await expectRounded(page, 'the resting dish');

    const scrollTo = (top) =>
      page.evaluate(async (t) => {
        document.querySelector('.dish-scroller').scrollTo({ top: t, behavior: 'instant' });
        await new Promise((r) => setTimeout(r, 250));
      }, top);
    const sheetTop = await page.evaluate(() => document.querySelector('.dish-sheet').offsetTop);
    await scrollTo(sheetTop);
    await expectRounded(page, 'the open dish');
    await scrollTo(sheetTop + 500);
    await expectRounded(page, 'the collapsed dish');
  });

  test('adding a meal, every step', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.add-meal-card')).toBeVisible();
    await expectRounded(page, 'add meal, step 1');

    await page.getByRole('tab', { selected: false }).first().click();
    await expectRounded(page, 'add meal, sketching');
    await page.getByRole('tab', { selected: false }).first().click();

    await page.setInputFiles('#photo', DISH_PHOTO);
    await expect(page.locator('.photo-crop-card')).toBeVisible();
    await expectRounded(page, 'the crop modal');
    await page.getByRole('button', { name: 'Use photo' }).click();
    await expect(page.locator('.photo-crop-card')).toBeHidden();
    await expectRounded(page, 'add meal, step 1 with a photo');

    await page.locator('.add-meal-next').click();
    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 2 OF 3/i);
    await page.locator('textarea').first().fill('Leeks, charred.');
    await expectRounded(page, 'add meal, step 2');

    await page.locator('.add-meal-next').click();
    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
    await expectRounded(page, 'add meal, step 3');
  });

  test('settings, as a guest', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expectRounded(page, 'settings, as a guest');
  });

  test('settings, signed in', async ({ page }) => {
    await boot(page, { signedIn: true });
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText(USER.email)).toBeVisible();
    await expectRounded(page, 'settings, signed in');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expectRounded(page, 'settings, changing the password');
  });

  test('signing in, and setting up a page', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Email').fill(USER.email);
    await expectRounded(page, 'sign in');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toBeVisible();
    await expectRounded(page, 'reset password');
  });

  test('choosing a page name, then Local Import', async ({ page }) => {
    await boot(page, { signedIn: true, chef: null });
    await expect(page.getByRole('heading', { name: 'Set up your page' })).toBeVisible();
    await page.locator('#chef-name').fill('Ana');
    await expectRounded(page, 'choose a page name');
    await page.getByRole('button', { name: /create|continue|save/i }).first().click();
    await expect(page.getByRole('button', { name: /import/i }).first()).toBeVisible();
    await expectRounded(page, 'Local Import');
  });

  test('the welcome tour', async ({ page }) => {
    await boot(page, { tour: true });
    await expect(page.locator('.onboarding-card')).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await expectRounded(page, `the tour, step ${i + 1}`);
      const next = page.getByRole('button', { name: 'Next' });
      if (!(await next.isVisible())) break;
      await next.click();
    }
  });

  test('a chef’s public page', async ({ page }) => {
    await boot(page, { path: '/ana' });
    await expect(page.locator('.meal-card')).toHaveCount(3);
    await expectRounded(page, 'the public page');
  });
});
