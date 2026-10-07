import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// An icon button shows its icon, in iOS Safari too.
//
// Safari on iOS gives every <button> padding of its own (about 14px a side).
// A sized icon button -- a 20px delete badge, a 32px close -- has less room
// than that, so the padding pushed its box wider than it is tall (an oval)
// and the icon, a flex item, shrank until it had no width: an empty circle.
// Chromium's buttons carry far less padding, so the suite never saw it.
//
// This puts that padding back on every button that holds an icon, as a
// style sheet that sits under the app's own (an element selector loses to
// any class, as a user-agent rule does), and checks that each is still a
// circle with its icon drawn. WebKit isn't in this suite; this stands in
// for it.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

const photo = (fill) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${fill}"/></svg>`);

const MEALS = ['m2', 'm1'].map((id, i) => ({
  id,
  name: `Dish ${i}`,
  cuisine: 'French',
  category: 'Main',
  date: `2026-09-1${i}`,
  serves: 2,
  photos: [photo('#5a8')],
  ingredients: ['leek'],
  method: ['Char the leeks.'],
  description: 'A plate built on smoke.',
  note: '',
}));

async function boot(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: route.request().url().includes('/auth/v1/') ? '{}' : '[]' })
  );
  await page.addInitScript((meals) => localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals)), MEALS);
  await page.goto('/');
  await expect(page.locator('.meal-card')).toHaveCount(2);
  // iOS's own padding on a button, under the app's rules.
  await page.evaluate(() => {
    const sheet = document.createElement('style');
    sheet.textContent = 'button:has(> svg) { padding: 0 14px; }';
    document.head.prepend(sheet);
  });
}

/** Each match must be a circle (as wide as tall) with its icon drawn at a size. */
async function expectIconsDrawn(page, selector, { circle, glyph }) {
  const found = await page.locator(selector).evaluateAll((buttons) =>
    buttons.map((button) => {
      const b = button.getBoundingClientRect();
      const s = button.querySelector('svg').getBoundingClientRect();
      return { name: button.getAttribute('aria-label'), box: [b.width, b.height], glyph: [s.width, s.height] };
    }),
  );
  expect(found.length, `no ${selector} on the page`).toBeGreaterThan(0);
  for (const one of found) {
    expect(one.box, `${selector} ${one.name}: the button`).toEqual([circle, circle]);
    expect(one.glyph, `${selector} ${one.name}: the icon`).toEqual([glyph, glyph]);
  }
}

test.describe('with iOS’s padding on every button', () => {
  test('the delete badges on the gallery’s cards show their cross', async ({ page }) => {
    await boot(page);
    const card = await page.locator('.meal-card').first().boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 3);
    await page.mouse.down();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.mouse.up();
    await page.getByRole('button', { name: 'Edit gallery' }).click();
    await expect(page.locator('.delete-badge').first()).toBeVisible();
    await expectIconsDrawn(page, '.delete-badge', { circle: 26, glyph: 16 });
  });

  test('the delete badge on an Add a photo thumbnail shows its cross', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.setInputFiles('#photo', DISH_PHOTO);
    await page.getByRole('button', { name: 'Use photo' }).click();
    await expect(page.locator('.photo-crop-card')).toBeHidden();
    await expect(page.locator('.photo-carousel-remove')).toBeVisible();
    await expectIconsDrawn(page, '.photo-carousel-remove', { circle: 20, glyph: 12 });
  });

  test('the filter sheet’s close shows its cross', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Open filters' }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await expectIconsDrawn(page, '.filter-sheet-close', { circle: 32, glyph: 16 });
  });

  test('the filter button and the nav tabs keep their shape and their icons', async ({ page }) => {
    await boot(page);
    await expectIconsDrawn(page, '.gallery-filter-btn', { circle: 44, glyph: 24 });
    const tabs = await page.locator('.bottom-nav-tab').evaluateAll((all) =>
      all.map((tab) => {
        const b = tab.getBoundingClientRect();
        const s = tab.querySelector('svg').getBoundingClientRect();
        return { box: [b.width, b.height], glyph: [s.width, s.height] };
      }),
    );
    expect(tabs).toEqual([
      { box: [52, 48], glyph: [24, 24] },
      { box: [52, 48], glyph: [24, 24] },
    ]);
  });
});
