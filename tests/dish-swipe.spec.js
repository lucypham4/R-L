import { test, expect } from './support/network';

// Swiping between dishes, and the back arrow, pinned.
//
// A horizontal drag slides the photo along the shelf under the finger, the
// neighbour's photo comes in from the side you're heading, and the text
// below drops out of focus. Past a third of the way, or with a flick, the
// move finishes; short of it, everything settles back. Driven with raw
// touch points through the DevTools protocol, since that is what reaches
// the browser's real gesture handling.

// Three distinguishable photos, so the ghost's source says which dish is
// coming in.
const photo = (fill) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle cx="200" cy="200" r="180" fill="${fill}"/></svg>`);

const PHOTOS = { newest: photo('#b56'), middle: photo('#5a8'), oldest: photo('#58c') };

const dish = (id, name, date, src) => ({
  id,
  name,
  cuisine: 'Test',
  category: 'Main',
  date,
  serves: 2,
  photos: [src],
  ingredients: ['salt'],
  method: ['Season it.'],
  description: `${name}, described.`,
  note: '',
});

const MEALS = [
  dish('m3', 'Newest dish', '2026-09-24', PHOTOS.newest),
  dish('m2', 'Middle dish', '2026-09-18', PHOTOS.middle),
  dish('m1', 'Oldest dish', '2026-09-10', PHOTOS.oldest),
];

const NAME = '.dish-hero-title .dish-name-in';

async function boot(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript((meals) => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
  }, MEALS);
  await page.goto('/');
}

/** Opens the gallery's nth dish (newest first) and waits for it to settle. */
async function openDish(page, nth) {
  await page.locator('.meal-card').nth(nth).click();
  await expect(page.locator('.dish')).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}

/**
 * A finger on the photo. `press` and `moveBy` leave it down, so the middle
 * of a gesture can be inspected; `lift` lets go. `stepMs` sets the speed.
 */
async function finger(page) {
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator('.dish-photo').boundingBox();
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  return {
    press: () => send('touchStart', [{ ...at, id: 1 }]),
    async moveBy(dx, { steps = 12, stepMs = 16 } = {}) {
      const x0 = at.x;
      for (let i = 1; i <= steps; i++) {
        at.x = x0 + (dx * i) / steps;
        await send('touchMove', [{ ...at, id: 1 }]);
        await page.waitForTimeout(stepMs);
      }
    },
    async lift({ holdMs = 150 } = {}) {
      // Held still first unless asked otherwise, so the release carries
      // no fling.
      await page.waitForTimeout(holdMs);
      await send('touchEnd', []);
    },
  };
}

async function drag(page, dx, options) {
  const f = await finger(page);
  await f.press();
  await f.moveBy(dx, options);
  await f.lift(options);
}

const readSwipe = (page) =>
  page.evaluate(() => {
    const photoEl = document.querySelector('.dish-photo');
    const ghost = document.querySelector('.dish-ghost');
    return {
      photoX: parseFloat(getComputedStyle(photoEl).translate) || 0,
      ghostShown: !ghost.hidden,
      ghostSrc: ghost.getAttribute('src'),
      ghostX: parseFloat(getComputedStyle(ghost).translate) || 0,
      bodyFilter: document.querySelector('.dish-body').style.filter,
    };
  });

// Every running animation, finished or cancelled. The name's outgoing copy
// is unmounted part-way through its dissolve, which rejects its promise.
const settle = (page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));

test.describe('swiping between dishes', () => {
  test('a drag carries the photo under the finger and brings the next dish in beside it', async ({ page }) => {
    await boot(page);
    await openDish(page, 1);
    await expect(page.locator(NAME)).toHaveText('Middle dish');

    const f = await finger(page);
    await f.press();
    await f.moveBy(-70);
    const mid = await readSwipe(page);
    // The photo is where the finger is...
    expect(mid.photoX).toBeCloseTo(-70, 0);
    // ...the next dish (the newer one, to the right) is coming in behind
    // it, a photo-width and a gap further along...
    expect(mid.ghostShown).toBe(true);
    expect(mid.ghostSrc).toBe(MEALS[0].photos[0]);
    expect(mid.ghostX).toBeGreaterThan(100);
    // ...and the text has dropped out of focus.
    expect(mid.bodyFilter).toContain('blur');

    // Short of a third of the way, held still: it settles back.
    await f.lift();
    await settle(page);
    const after = await readSwipe(page);
    await expect(page.locator(NAME)).toHaveText('Middle dish');
    expect(after.photoX).toBe(0);
    expect(after.ghostShown).toBe(false);
    expect(after.bodyFilter).toBe('');
  });

  test('let go past a third of the way and it moves to that dish', async ({ page }) => {
    await boot(page);
    await openDish(page, 1);
    await drag(page, -160);
    await expect(page.locator(NAME)).toHaveText('Newest dish');
    expect(new URL(page.url()).searchParams.get('meal')).toBe('m3');
    await settle(page);
    const after = await readSwipe(page);
    expect(after.photoX).toBe(0);
    expect(after.ghostShown).toBe(false);
  });

  test('a flick moves on however short it was', async ({ page }) => {
    await boot(page);
    await openDish(page, 1);
    // Well short of a third of the way, but fast and lifted mid-motion.
    await drag(page, 80, { steps: 3, stepMs: 0, holdMs: 0 });
    await expect(page.locator(NAME)).toHaveText('Oldest dish');
  });

  test('a drag that stops before it lifts is not a flick', async ({ page }) => {
    await boot(page);
    await openDish(page, 1);
    await drag(page, 80, { steps: 3, stepMs: 0, holdMs: 250 });
    await settle(page);
    await expect(page.locator(NAME)).toHaveText('Middle dish');
  });

  test('at the end of the shelf the drag resists and settles back', async ({ page }) => {
    await boot(page);
    await openDish(page, 0);
    const f = await finger(page);
    await f.press();
    await f.moveBy(-160);
    const mid = await readSwipe(page);
    // Moving, but by much less than the finger: there's nothing that way.
    expect(mid.photoX).toBeLessThan(-10);
    expect(mid.photoX).toBeGreaterThan(-100);
    expect(mid.ghostShown).toBe(false);
    await f.lift();
    await settle(page);
    await expect(page.locator(NAME)).toHaveText('Newest dish');
    expect((await readSwipe(page)).photoX).toBe(0);
  });

  test('the step arrows slide along the shelf the same way', async ({ page }) => {
    await boot(page);
    await openDish(page, 1);
    await page.getByRole('button', { name: 'Previous dish' }).click();
    // Mid-slide: the outgoing photo is on the ghost, leaving.
    const mid = await page.evaluate(() => {
      const ghost = document.querySelector('.dish-ghost');
      return { shown: !ghost.hidden, src: ghost.getAttribute('src'), moving: document.querySelector('.dish-photo').getAnimations().length > 0 };
    });
    expect(mid.shown).toBe(true);
    expect(mid.src).toBe(MEALS[1].photos[0]);
    expect(mid.moving).toBe(true);
    await expect(page.locator(NAME)).toHaveText('Oldest dish');
    await settle(page);
    expect((await readSwipe(page)).ghostShown).toBe(false);
  });

  test('a chef’s public page swipes between dishes too', async ({ page }) => {
    const rows = MEALS.map((m) => ({ ...m, user_id: 'chef-1' }));
    await page.route('**stub.supabase.co/**', (route) => {
      const url = route.request().url();
      const body = url.includes('/rest/v1/chefs')
        ? [{ id: 'chef-1', slug: 'ana', display_name: 'Ana', page_theme: 'light' }]
        : url.includes('/rest/v1/meals')
          ? rows
          : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/ana');
    await openDish(page, 1);
    await expect(page.locator(NAME)).toHaveText('Middle dish');
    await drag(page, -160);
    await expect(page.locator(NAME)).toHaveText('Newest dish');
  });
});

test.describe('the back arrow', () => {
  test('is an arrow labelled Back, and opening a dish draws no ring round it', async ({ page }) => {
    await boot(page);
    await openDish(page, 1);
    const back = page.getByRole('button', { name: 'Back' });
    await expect(back).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0);
    // Focus goes into the recipe, not onto the arrow.
    expect(await page.evaluate(() => document.activeElement.className)).toContain('dish-scroller');
    expect(await back.evaluate((el) => el.matches(':focus-visible'))).toBe(false);
  });

  test('stepping with the keyboard keeps focus on the step arrow', async ({ page }) => {
    await boot(page);
    await openDish(page, 0);
    const previous = page.getByRole('button', { name: 'Previous dish' });
    await previous.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(NAME)).toHaveText('Middle dish');
    expect(await previous.evaluate((el) => el === document.activeElement)).toBe(true);
  });

  test('goes back, rather than adding an entry the browser’s Back would reopen', async ({ page }) => {
    await boot(page);
    await openDish(page, 1);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.dish')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('meal')).toBeNull();
    // Forward returns to the dish, which is only possible if closing it
    // moved back in history instead of pushing a new entry.
    await page.goForward();
    await expect(page.locator(NAME)).toHaveText('Middle dish');
  });
});
