import { test, expect } from './support/network';

// The filter button on the home screen and the sheet it opens.
//
//   - The button is one solid, contrasting circle, 44px square, with two
//     lines and their round nodes drawn in the page colour. When a filter is
//     on, an accent dot shows on it and its name says how many.
//   - The sheet's close button shows a cross, and closing (by it, by the
//     backdrop or by Escape) plays an exit: the sheet drops and the backdrop
//     fades, then the sheet is gone. Reduced motion keeps the fade and drops
//     the slide (motion.md).

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
  ingredients: ['leek'],
  method: ['Char the leeks.'],
  description: 'A plate built on smoke.',
  note: '',
});

const MEALS = [dish('m2', 'Coq au vin', 'French', '2026-09-18'), dish('m1', 'Cacio e pepe', 'Italian', '2026-09-11')];

async function boot(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: route.request().url().includes('/auth/v1/') ? '{}' : '[]' })
  );
  await page.addInitScript((meals) => localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals)), MEALS);
  await page.goto('/');
  await expect(page.locator('.meal-card')).toHaveCount(2);
}

/** A token as the browser resolves it, so it compares with computed style. */
function resolve(page, property, token) {
  return page.evaluate(
    ({ property, token }) => {
      const probe = document.createElement('i');
      probe.style[property] = `var(${token})`;
      document.body.append(probe);
      const value = getComputedStyle(probe)[property];
      probe.remove();
      return value;
    },
    { property, token },
  );
}

const trigger = (page) => page.getByRole('button', { name: 'Open filters' });
const sheet = (page) => page.getByRole('dialog', { name: 'Filters' });

/** The animations running on the page, by name. */
const running = (page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.animationName)
      .map((a) => a.animationName),
  );

test.describe('the filter button', () => {
  test('is a 44px circle with the page colour drawn on a solid ink fill', async ({ page }) => {
    await boot(page);
    const button = trigger(page);
    const box = await button.boundingBox();
    expect(box.width).toBe(44);
    expect(box.height).toBe(44);

    const look = await button.evaluate((el) => {
      const cs = getComputedStyle(el);
      const svg = getComputedStyle(el.querySelector('svg'));
      return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, stroke: svg.stroke, fill: svg.fill };
    });
    expect(look.bg).toBe(await resolve(page, 'color', '--color-ink'));
    // Strokes are the page colour, and the shapes are drawn, not filled.
    expect(look.stroke).toBe(await resolve(page, 'color', '--color-bg'));
    expect(look.fill).toBe('none');
    expect(parseFloat(look.radius)).toBeGreaterThanOrEqual(22);
  });

  test('stands beside the search field, the same height, and not inside it', async ({ page }) => {
    await boot(page);
    const field = await page.locator('.gallery-search-field').boundingBox();
    const button = await trigger(page).boundingBox();
    expect(button.height).toBe(field.height);
    expect(button.x).toBeGreaterThanOrEqual(field.x + field.width);
    await expect(page.locator('.gallery-search-field').getByRole('button')).toHaveCount(0);
  });

  test('the icon is two lines broken around two hollow, staggered nodes', async ({ page }) => {
    await boot(page);
    const icon = await trigger(page).evaluate((el) => {
      const svg = el.querySelector('svg');
      const box = svg.getBoundingClientRect();
      const own = getComputedStyle(svg);
      return {
        viewBox: svg.getAttribute('viewBox'),
        nodes: [...svg.querySelectorAll('circle')].map((c) => ({
          cx: +c.getAttribute('cx'),
          cy: +c.getAttribute('cy'),
          r: +c.getAttribute('r'),
          fill: getComputedStyle(c).fill,
        })),
        // Each line is drawn in two pieces, one either side of its node.
        pieces: [...svg.querySelectorAll('path')].map((p) => (p.getAttribute('d').match(/M/g) || []).length),
        strokeWidth: own.strokeWidth,
        linecap: own.strokeLinecap,
        stroke: own.stroke,
        width: box.width,
        height: box.height,
      };
    });
    expect(icon.viewBox).toBe('0 0 512 512');
    expect(icon.nodes).toHaveLength(2);
    const [top, bottom] = icon.nodes;
    // Staggered: the top node left of centre, the bottom one right of it.
    expect(top.cy).toBeLessThan(bottom.cy);
    expect(top.cx).toBeLessThan(256);
    expect(bottom.cx).toBeGreaterThan(256);
    // Hollow, and the same size.
    expect(top.fill).toBe('none');
    expect(bottom.fill).toBe('none');
    expect(top.r).toBe(bottom.r);
    // Two lines, each in two pieces round its node.
    expect(icon.pieces).toEqual([2, 2]);
    // The stroke weight and round caps, in the page colour (currentColor).
    expect(icon.strokeWidth).toBe('40px');
    expect(icon.linecap).toBe('round');
    expect(icon.stroke).toBe(await resolve(page, 'color', '--color-bg'));
    // Large enough to read at a glance, and not squeezed.
    expect(icon.width).toBe(24);
    expect(icon.height).toBe(24);
  });

  test('is ink in the dark theme too, so it flips with the page', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await boot(page);
    const look = await trigger(page).evaluate((el) => ({
      bg: getComputedStyle(el).backgroundColor,
      stroke: getComputedStyle(el.querySelector('svg')).stroke,
      page: getComputedStyle(document.body).backgroundColor,
    }));
    expect(look.bg).toBe(await resolve(page, 'color', '--color-ink'));
    expect(look.stroke).toBe(look.page);
    expect(look.bg).not.toBe(look.page);
  });

  test('shows an accent dot, ringed in the button’s fill, once a filter is on', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.gallery-filter-dot')).toHaveCount(0);
    await trigger(page).click();
    await page.locator('.filter-sheet button', { hasText: 'French' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(sheet(page)).toBeHidden();
    const dot = page.locator('.gallery-filter-dot');
    await expect(dot).toHaveCount(1);
    await page.mouse.move(0, 0);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
    const look = await dot.evaluate((el) => {
      const cs = getComputedStyle(el);
      const d = el.getBoundingClientRect();
      const b = el.parentElement.getBoundingClientRect();
      return {
        width: d.width,
        ring: cs.borderTopColor,
        ringWidth: cs.borderTopWidth,
        fill: cs.backgroundColor,
        button: getComputedStyle(el.parentElement).backgroundColor,
        // Inside the button's own box, clear of its top-right corner.
        inside: d.top >= b.top && d.right <= b.right,
        // Where the dot's ring ends, against where the icon's top line begins.
        ringBottom: d.bottom,
        iconTop: el.parentElement.querySelector('svg').querySelector('path').getBoundingClientRect().top,
      };
    });
    expect(look.width).toBe(12);
    expect(look.ringWidth).toBe('2px');
    expect(look.fill).toBe(await resolve(page, 'color', '--color-accent'));
    // The ring is the button's fill, so it cuts a gap rather than showing as a line.
    expect(look.ring).toBe(look.button);
    expect(look.ring).toBe(await resolve(page, 'color', '--color-ink'));
    expect(look.inside).toBe(true);
    expect(look.ringBottom).toBeLessThanOrEqual(look.iconTop + 1);
  });

  test('the accent dot is the accent in the dark theme too', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await boot(page);
    await trigger(page).click();
    await page.locator('.filter-sheet button', { hasText: 'French' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(sheet(page)).toBeHidden();
    const look = await page.locator('.gallery-filter-dot').evaluate((el) => ({
      fill: getComputedStyle(el).backgroundColor,
      ring: getComputedStyle(el).borderTopColor,
    }));
    expect(look.fill).toBe(await resolve(page, 'color', '--color-accent'));
    expect(look.ring).toBe(await resolve(page, 'color', '--color-ink'));
  });

  test('says how many filters are on, in its name', async ({ page }) => {
    await boot(page);
    // None on: it is just the button that opens the sheet.
    await expect(trigger(page)).toHaveAttribute('aria-label', 'Open filters');
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog');

    await trigger(page).click();
    await page.locator('.filter-sheet button', { hasText: 'French' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open filters, 1 active' })).toBeVisible();

    // Cuisine, category and year each count once.
    await trigger(page).click();
    await page.locator('.filter-sheet button', { hasText: 'Italian' }).click();
    await page.locator('.filter-sheet button', { hasText: 'Main' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open filters, 3 active' })).toBeVisible();

    // Clear all: back to the plain name, and the dot goes with it.
    await trigger(page).click();
    await page.getByRole('button', { name: 'Clear all' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Open filters', exact: true })).toBeVisible();
    await expect(page.locator('.gallery-filter-dot')).toHaveCount(0);
  });

  test('opens the sheet', async ({ page }) => {
    await boot(page);
    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
  });
});

test.describe('the filter sheet’s close button', () => {
  test('shows a cross, in ink, centred in its circle', async ({ page }) => {
    await boot(page);
    await trigger(page).click();
    const close = sheet(page).getByRole('button', { name: 'Close' });
    await expect(close).toBeVisible();
    const look = await close.evaluate((el) => {
      const svg = el.querySelector('svg');
      const b = el.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      return {
        circle: [b.width, b.height],
        glyph: [s.width, s.height],
        // How far the glyph's centre is from the circle's.
        off: [Math.abs(s.x + s.width / 2 - (b.x + b.width / 2)), Math.abs(s.y + s.height / 2 - (b.y + b.height / 2))],
        stroke: getComputedStyle(svg.querySelector('path')).stroke,
      };
    });
    expect(look.circle).toEqual([32, 32]);
    expect(look.glyph).toEqual([16, 16]);
    expect(look.off[0]).toBeLessThanOrEqual(0.5);
    expect(look.off[1]).toBeLessThanOrEqual(0.5);
    expect(look.stroke).toBe(await resolve(page, 'color', '--color-ink'));
  });

  test('closing drops the sheet and fades the backdrop, then takes them off the page', async ({ page }) => {
    await boot(page);
    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    expect(await running(page)).toEqual([]);

    await page.getByRole('button', { name: 'Close' }).click();
    // Both are running: the sheet's drop and the backdrop's fade.
    expect((await running(page)).sort()).toEqual(['filter-sheet-drop', 'filter-sheet-scrim-out']);
    // The sheet is still on the page while it leaves, and takes no more taps.
    await expect(sheet(page)).toBeVisible();
    expect(await page.locator('.filter-sheet-overlay').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

    // Part-way, it has moved down and the backdrop is part-faded.
    const mid = await page.evaluate(() => {
      const overlay = document.querySelector('.filter-sheet-overlay');
      const sheetEl = document.querySelector('.filter-sheet');
      const drop = sheetEl.getAnimations().find((a) => a.animationName === 'filter-sheet-drop');
      const fade = overlay.getAnimations().find((a) => a.animationName === 'filter-sheet-scrim-out');
      drop.pause();
      fade.pause();
      drop.currentTime = drop.effect.getComputedTiming().duration / 2;
      fade.currentTime = fade.effect.getComputedTiming().duration / 2;
      const sheetRect = sheetEl.getBoundingClientRect();
      const result = {
        slide: new DOMMatrix(getComputedStyle(sheetEl).transform).m42,
        height: sheetRect.height,
        opacity: parseFloat(getComputedStyle(overlay).opacity),
      };
      drop.play();
      fade.play();
      return result;
    });
    expect(mid.slide).toBeGreaterThan(0);
    expect(mid.slide).toBeLessThan(mid.height);
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThan(1);

    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('.filter-sheet-overlay')).toHaveCount(0);
    // Back on the home screen, scrolling is the page's again.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect(trigger(page)).toBeVisible();
  });

  test('the backdrop and Escape leave the same way', async ({ page }) => {
    await boot(page);
    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
    // The backdrop is the part of the overlay above the sheet.
    await page.mouse.click(10, 10);
    expect(await running(page)).toContain('filter-sheet-drop');
    await expect(sheet(page)).toHaveCount(0);

    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await running(page)).toContain('filter-sheet-drop');
    await expect(sheet(page)).toHaveCount(0);
  });

  test('a second tap while it leaves does nothing, and the sheet opens again after', async ({ page }) => {
    await boot(page);
    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
    const close = page.getByRole('button', { name: 'Close' });
    await close.click();
    await close.dispatchEvent('click');
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);

    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(page.locator('.filter-sheet-overlay-closing')).toHaveCount(0);
  });

  test('picking a filter does not move focus back to the close button', async ({ page }) => {
    await boot(page);
    await trigger(page).click();
    const french = page.locator('.filter-sheet button', { hasText: 'French' });
    await french.click();
    await expect(french).toHaveAttribute('aria-pressed', 'true');
    await expect(french).toBeFocused();
  });

  test.describe('with reduced motion', () => {
    test('the sheet stays put and fades with the backdrop, then goes', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await boot(page);
      await trigger(page).click();
      await expect(sheet(page)).toBeVisible();
      await page.getByRole('button', { name: 'Close' }).click();
      // The slide is dropped; the fade, which carries no motion, stays.
      expect(await running(page)).toEqual(['filter-sheet-scrim-out']);
      await expect(sheet(page)).toBeVisible();
      expect(await page.locator('.filter-sheet').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42)).toBe(0);
      await expect(sheet(page)).toHaveCount(0);
    });
  });
});
