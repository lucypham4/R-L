import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';
import { findCapitals } from './support/caps';

// Sentence case, everywhere (shape.md): "Step 1 of 3", "3 of 3 meals", a
// field's "(optional)" beside its label, and the wordmark written "Staj".
// corners.spec.js walks every screen for any style that draws capitals
// (tests/support/caps.js); this pins the text that matters, as rendered
// (`innerText` applies CSS transforms, `textContent` doesn't), and that a
// chef's own capitals are left alone.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

const photo = (fill) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${fill}"/></svg>`);

const dish = (id, name, date, fill) => ({
  id,
  name,
  cuisine: 'French',
  category: 'Main',
  date,
  serves: 2,
  photos: [photo(fill)],
  ingredients: ['leek', 'brown butter'],
  method: ['Char the leeks over coals.'],
  description: 'A plate built on smoke.',
  note: '',
});

// A dish whose name is in capitals because its chef typed it that way.
const MEALS = [dish('m2', 'BBQ ribs', '2026-09-18', '#5a8'), dish('m1', 'Charred leek', '2026-09-11', '#58c')];

async function boot(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: route.request().url().includes('/auth/v1/') ? '{}' : '[]' })
  );
  await page.addInitScript((meals) => localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals)), MEALS);
  await page.goto('/');
  await expect(page.locator('.meal-card')).toHaveCount(2);
}

const text = (locator) => locator.evaluate((el) => el.innerText.trim());

test.describe('sentence case', () => {
  test('the gallery: the count and each card’s date', async ({ page }) => {
    await boot(page);
    expect(await text(page.locator('.gallery-count'))).toBe('2 of 2 meals');
    // "18 Sept 2026": a capital for the month and lower case after it,
    // whatever the browser's ICU calls September.
    for (const date of await page.locator('.meal-card-date').allInnerTexts()) {
      expect(date.trim()).toMatch(/^\d{2} [A-Z][a-z]+ 2026$/);
    }
  });

  test('a chef’s own capitals are shown as they typed them, and are not a failure', async ({ page }) => {
    await boot(page);
    expect(await text(page.locator('.meal-card-name').first())).toBe('BBQ ribs');
    // The finder reads style, never the letters, so BBQ ribs doesn't trip it.
    expect(await findCapitals(page)).toEqual([]);
  });

  test('the filter sheet’s labels', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Open filters' }).click();
    const labels = await page.locator('.filter-sheet-label').allInnerTexts();
    expect(labels.map((l) => l.trim())).toEqual(expect.arrayContaining(['Cuisine', 'Category', 'Year']));
  });

  test('the dish: its meta line, date and serves, and the share image’s byline', async ({ page }) => {
    await boot(page);
    await page.locator('.meal-card').first().click();
    await expect(page.locator('.dish-peek-meta')).toBeVisible();
    expect(await text(page.locator('.dish-peek-meta'))).toBe('French · Main');
    const facts = await page.locator('.dish-peek-facts .meta').allInnerTexts();
    expect(facts.map((f) => f.trim())).toEqual([expect.stringMatching(/^\d{1,2} [A-Z][a-z]+ 2026$/), 'Serves 2']);
    // The exported image is drawn off-screen; its byline is the wordmark.
    expect(await text(page.locator('.share-card-footer'))).toBe('Staj');
    expect(await text(page.locator('.share-card-sub'))).toMatch(/^French · \d{1,2} [A-Z][a-z]+ 2026 · Serves 2$/);
  });

  test('add a meal: the step counter, a label and its “(optional)”', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    expect(await text(page.locator('.add-meal-progress'))).toBe('Step 1 of 3');

    await page.setInputFiles('#photo', DISH_PHOTO);
    await page.getByRole('button', { name: 'Use photo' }).click();
    await page.locator('.add-meal-next').click();
    await page.locator('textarea').first().fill('Leeks, charred.');
    await page.locator('.add-meal-next').click();
    await expect(page.locator('.add-meal-progress')).toHaveText(/Step 3 of 3/);
    expect(await text(page.locator('.add-meal-progress'))).toBe('Step 3 of 3');

    // The label, then "(optional)" in parentheses and lighter, so it reads
    // as a side note rather than as part of the label.
    const summary = page.locator('label[for="meal-summary"]');
    expect((await summary.textContent()).replace(/\s+/g, ' ').trim()).toBe('Summary (optional)');
    const [label, marker, muted, disabled] = await summary.evaluate((el) => {
      const probe = (token) => {
        const p = document.createElement('i');
        p.style.color = `var(${token})`;
        document.body.append(p);
        const c = getComputedStyle(p).color;
        p.remove();
        return c;
      };
      return [
        getComputedStyle(el).color,
        getComputedStyle(el.querySelector('.field-optional')).color,
        probe('--color-muted'),
        probe('--color-disabled'),
      ];
    });
    expect(label).toBe(muted);
    expect(marker).toBe(disabled);
    expect(marker).not.toBe(label);
    // A required field shows an asterisk, not a word; the word is there for
    // a screen reader only (visually hidden).
    const name = page.locator('label[for="meal-name"]');
    expect(await text(name.locator('.field-required'))).toBe('*');
    expect((await name.textContent()).trim()).toMatch(/^Meal name\*\s+required$/);
  });

  test('the wordmark on the sign-in screen is "Staj"', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'My profile' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(await text(page.locator('.signin-eyebrow'))).toBe('Staj');
  });
});
