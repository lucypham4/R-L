import { test, expect } from './support/network';

// Edit mode as the Figma file draws it ("Gallery · Edit mode v2"). Two
// things changed from v1, and both are easy to undo by accident:
//
//   - The header's rule goes. The edit bar's is the page's only one, so the
//     controls and the grid are divided once, not twice in quick succession.
//   - The × hangs off the photo's top-right corner instead of sitting in
//     it, in a neutral fill rather than the danger red. It's the app's
//     close icon, as it is everywhere else, rather than a font's ×.

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
  ingredients: [],
  method: [],
  description: `${name}, described.`,
  note: '',
});

const MEALS = [
  dish('m4', 'Beetroot, horseradish', '2026-09-24', '#b56'),
  dish('m3', 'Cacio e pepe', '2026-09-18', '#5a8'),
  dish('m2', 'Charred leek', '2026-09-11', '#58c'),
  dish('m1', 'Lamb tagine', '2026-09-04', '#c93'),
];

const CLEAR = 'rgba(0, 0, 0, 0)';

async function boot(page) {
  await page.addInitScript((meals) => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
  }, MEALS);
  await page.goto('/');
  await expect(page.locator('.meal-card')).toHaveCount(MEALS.length);
}

/** Long-presses the first card and takes "Edit gallery" from its sheet. */
async function enterEditMode(page) {
  const card = await page.locator('.meal-card').first().boundingBox();
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 3);
  await page.mouse.down();
  await expect(page.getByRole('dialog', { name: MEALS[0].name })).toBeVisible();
  await page.mouse.up();
  await page.getByRole('button', { name: 'Edit gallery' }).click();
  await expect(page.locator('.gallery-edit-bar')).toBeVisible();
  // The pointer is left over a card, which lifts on hover; park it and let
  // that finish, so what's measured next is the layout at rest.
  await page.mouse.move(0, 0);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
}

const ruleUnderHeader = (page) =>
  page.locator('.gallery-header').evaluate((el) => getComputedStyle(el).borderBottomColor);

test.describe('edit mode', () => {
  test('the header’s rule steps aside, and the edit bar’s is the one that’s left', async ({ page }) => {
    await boot(page);
    const searchRow = page.locator('.gallery-search-row');
    expect(await ruleUnderHeader(page)).not.toBe(CLEAR);
    const restingTop = (await searchRow.boundingBox()).y;

    await enterEditMode(page);
    // It fades over --dur-color, so wait for it rather than sampling once.
    await expect.poll(() => ruleUnderHeader(page)).toBe(CLEAR);
    const bar = await page.locator('.gallery-edit-bar').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: cs.borderBottomWidth, color: cs.borderBottomColor };
    });
    expect(bar.width).toBe('1px');
    expect(bar.color).not.toBe(CLEAR);
    // The rule keeps its pixel, so the page doesn't jump on the way in.
    expect((await searchRow.boundingBox()).y).toBe(restingTop);

    await page.getByRole('button', { name: 'Done' }).click();
    await expect.poll(() => ruleUnderHeader(page)).not.toBe(CLEAR);
    expect((await searchRow.boundingBox()).y).toBe(restingTop);
  });

  test('the × hangs off its photo’s top-right corner, in the neutral fill', async ({ page }) => {
    await boot(page);
    await enterEditMode(page);

    const wraps = page.locator('.meal-card-wrap');
    await expect(wraps).toHaveCount(MEALS.length);
    const viewport = page.viewportSize();

    for (let i = 0; i < MEALS.length; i++) {
      const wrap = wraps.nth(i);
      const badge = await wrap.locator('.meal-card-delete-badge').boundingBox();
      const image = await wrap.locator('.meal-card-image').boundingBox();
      // 26 round, 10px past the photo's right edge and 8px above its top.
      expect(badge.width).toBe(26);
      expect(badge.height).toBe(26);
      expect(badge.x + badge.width - (image.x + image.width), `card ${i}, right`).toBeCloseTo(10, 0);
      expect(image.y - badge.y, `card ${i}, top`).toBeCloseTo(8, 0);
      // Hanging out never means hanging off the screen.
      expect(badge.x + badge.width, `card ${i}, inside the screen`).toBeLessThanOrEqual(viewport.width);
    }

    // The × is the app's close icon, drawn, not a character in a font. The
    // hint in the edit bar shows the same one.
    const badge = page.locator('.meal-card-delete-badge').first();
    await expect(badge.locator('svg')).toHaveCount(1);
    await expect(badge).toHaveText('');
    await expect(page.locator('.gallery-edit-bar svg')).toHaveCount(1);
    await expect(page.locator('.gallery-edit-bar')).not.toContainText('×');

    // The fill is --color-line-strong in whichever theme is showing, not
    // the danger colour it used to be.
    const { fill, lineStrong, danger } = await page.locator('.meal-card-delete-badge').first().evaluate((el) => {
      const resolve = (token) => {
        const probe = document.createElement('i');
        probe.style.background = `var(${token})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      };
      return {
        fill: getComputedStyle(el).backgroundColor,
        lineStrong: resolve('--color-line-strong'),
        danger: resolve('--color-danger'),
      };
    });
    expect(fill).toBe(lineStrong);
    expect(fill).not.toBe(danger);
  });
});
