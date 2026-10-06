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
    // The exported image is drawn off-screen; its byline is the wordmark,
    // in the serif it has on the first frame and big enough to be a mark.
    const byline = page.locator('.share-card-footer');
    expect(await text(byline)).toBe('Staj');
    const face = await byline.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily, size: parseFloat(cs.fontSize), weight: cs.fontWeight };
    });
    expect(face.family).toMatch(/^Tinos\b/);
    expect(face.weight).toBe('400');
    expect(face.size).toBeGreaterThanOrEqual(24);
    expect(await text(page.locator('.share-card-sub'))).toMatch(/^French · \d{1,2} [A-Z][a-z]+ 2026 · Serves 2$/);
  });

  /** Photo, notes, then the card (the stubbed AI answers with nothing). */
  async function toStep3(page) {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.setInputFiles('#photo', DISH_PHOTO);
    await page.getByRole('button', { name: 'Use photo' }).click();
    await page.locator('.add-meal-next').click();
    await page.locator('textarea').first().fill('Leeks, charred.');
    await page.locator('.add-meal-next').click();
    await expect(page.locator('.add-meal-progress')).toHaveText(/Step 3 of 3/);
  }

  test('add a meal: the step counter, a label and its “(optional)”', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    expect(await text(page.locator('.add-meal-progress'))).toBe('Step 1 of 3');
    await page.keyboard.press('Escape');
    await toStep3(page);
    expect(await text(page.locator('.add-meal-progress'))).toBe('Step 3 of 3');

    // The label, then "(optional)" in parentheses and at regular weight
    // against the label's medium, so it reads as a side note rather than as
    // part of the label.
    const summary = page.locator('label[for="meal-summary"]');
    expect((await summary.textContent()).replace(/\s+/g, ' ').trim()).toBe('Summary (optional)');
    const look = await summary.evaluate((el) => ({
      label: { weight: getComputedStyle(el).fontWeight },
      marker: { weight: getComputedStyle(el.querySelector('.field-optional')).fontWeight },
    }));
    expect(look.label.weight).toBe('500');
    expect(look.marker.weight).toBe('400');
    // A required field shows an asterisk, not a word; the word is there for
    // a screen reader only (visually hidden).
    const name = page.locator('label[for="meal-name"]');
    expect(await text(name.locator('.field-required'))).toBe('*');
    expect((await name.textContent()).trim()).toMatch(/^Meal name\*\s+required$/);
  });

  test('“(optional)” is legible: at least 4.5:1 against the card, in both themes', async ({ page }) => {
    await boot(page);
    await toStep3(page);
    const luminance = (rgb) => {
      const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const ratios = {};
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
      const { marker, card } = await page.evaluate(() => ({
        marker: getComputedStyle(document.querySelector('label[for="meal-summary"] .field-optional')).color,
        card: getComputedStyle(document.querySelector('.add-meal-card')).backgroundColor,
      }));
      ratios[scheme] = ratio(marker, card);
      expect(ratios[scheme], `${scheme}: ${marker} on ${card} is ${ratios[scheme].toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
    test.info().annotations.push({ type: 'contrast', description: `light ${ratios.light.toFixed(2)}:1, dark ${ratios.dark.toFixed(2)}:1` });
  });

  test('Method is "Method (optional)", with "step by step" in its placeholder', async ({ page }) => {
    await boot(page);
    await toStep3(page);
    const label = page.locator('label[for="meal-method"]');
    expect((await label.textContent()).replace(/\s+/g, ' ').trim()).toBe('Method (optional)');
    await expect(page.locator('#meal-method')).toHaveAttribute(
      'placeholder',
      'Step by step, one step per line, numbered automatically',
    );
  });

  test.describe('on a 375px-wide phone', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('the ingredient placeholder is never cut off', async ({ page }) => {
      await boot(page);
      await toStep3(page);
      await page.evaluate(() => document.fonts.ready);
      const input = page.locator('input[placeholder="Add ingredient"]');
      await input.scrollIntoViewIfNeeded();
      const fit = await input.evaluate((el) => {
        const cs = getComputedStyle(el);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = cs.font;
        return {
          text: ctx.measureText(el.placeholder).width,
          room: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
          right: el.getBoundingClientRect().right,
          viewport: document.documentElement.clientWidth,
          rowOverflow: el.parentElement.scrollWidth - el.parentElement.clientWidth,
        };
      });
      // The whole placeholder fits with a little to spare, and the input
      // stays on the screen and inside its row.
      expect(fit.text, `placeholder ${fit.text.toFixed(1)}px in ${fit.room.toFixed(1)}px`).toBeLessThanOrEqual(fit.room - 6);
      expect(fit.right).toBeLessThanOrEqual(fit.viewport);
      expect(fit.rowOverflow).toBeLessThanOrEqual(1);
    });
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
