import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// A dish's photo, flying between its card and the dish view, pinned.
//
// Opening a dish lifts its photo off the card and sets it down where the
// view keeps it; the back arrow carries it home while the view fades away.
// What can break unnoticed is the flight itself: a photo that jumps from
// one box to the other, or never leaves, still passes a screenshot of each
// rest. So the flight's box is read at the start, the middle and the end
// of its animation, and compared with the two boxes it joins.

const photo = (fill) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${fill}"/><circle cx="200" cy="250" r="140" fill="#fff" fill-opacity=".8"/></svg>`
  );

// Twelve dishes, newest first: more than a phone's screen holds, so the
// oldest is a long way down the gallery from the newest.
const MEALS = Array.from({ length: 12 }, (_, i) => {
  const n = 12 - i;
  return {
    id: `m${n}`,
    name: `Dish number ${n}`,
    cuisine: 'Test',
    category: 'Main',
    date: `2026-09-${String(10 + n).padStart(2, '0')}`,
    serves: 2,
    photos: [photo(`hsl(${n * 27} 50% 55%)`)],
    ingredients: ['salt'],
    // Long enough that the sheet's header can collapse all the way.
    method: Array.from({ length: 12 }, (_, step) => `Step ${step + 1}: season it, taste it, and season it again until it is right.`),
    description: `Dish ${n}, described.`,
    note: '',
  };
});

async function boot(page, url = '/', meals = MEALS) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript((meals) => {
    localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
  }, meals);
  await page.goto(url);
  await expect(page.locator('.meal-card').first()).toBeVisible();
}

const card = (id) => `[data-meal-photo="${id}"]`;

/** From now on, notes whether a flyer is ever put on the page. */
const watchForFlyers = (page) =>
  page.evaluate(() => {
    window.__flew = false;
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains('dish-flyer')) window.__flew = true;
    }).observe(document.body, { childList: true });
  });
const flew = (page) => page.evaluate(() => window.__flew);

/** The box of a selector, as plain numbers. Run in the page. */
const BOX = `(el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }`;

/** Where the flyer is at the start, middle and end of its animation. */
async function flightBoxes(page) {
  // The copy is on the page from the start, but takes off once the photo it
  // lands on has loaded.
  await page.waitForFunction(() => document.querySelector('.dish-flyer')?.getAnimations().length > 0);
  return page.evaluate((boxSrc) => {
    const box = eval(boxSrc);
    const flyer = document.querySelector('.dish-flyer');
    const animation = flyer.getAnimations()[0];
    const duration = animation.effect.getTiming().duration;
    animation.pause();
    const at = (t) => {
      animation.currentTime = t;
      return box(flyer);
    };
    // Visibility is what it is while the flyer is in the air.
    const visibility = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).visibility : null;
    };
    const result = {
      duration,
      start: at(0),
      mid: at(duration / 2),
      end: at(duration),
      photoHidden: visibility('.dish-photo'),
      cardsHidden: [...document.querySelectorAll('[data-meal-photo]')]
        .filter((el) => getComputedStyle(el).visibility === 'hidden')
        .map((el) => el.dataset.mealPhoto),
    };
    // A paused animation never finishes, and the flight's landing is what
    // lets everything go.
    animation.finish();
    return result;
  }, BOX);
}

const near = (a, b, tolerance = 2) => {
  for (const key of ['left', 'top', 'width', 'height']) {
    expect(Math.abs(a[key] - b[key]), `${key}: ${a[key]} vs ${b[key]}`).toBeLessThanOrEqual(tolerance);
  }
};

/** Strictly between two boxes, on every side that differs. */
const between = (mid, a, b) => {
  for (const key of ['left', 'top', 'width', 'height']) {
    const [lo, hi] = [a[key], b[key]].sort((x, y) => x - y);
    if (hi - lo < 20) continue;
    expect(mid[key], key).toBeGreaterThan(lo + 1);
    expect(mid[key], key).toBeLessThan(hi - 1);
  }
};

const boxOf = (page, selector) => page.evaluate(([sel, src]) => eval(src)(document.querySelector(sel)), [selector, BOX]);

/** Taps a card the way a finger would reach the app: a click on it. */
const tapCard = (page, id) => page.evaluate((sel) => document.querySelector(sel).closest('.meal-card').click(), card(id));

/** Lets everything in flight land. */
const settle = (page) =>
  expect
    .poll(() => page.evaluate(() => document.querySelectorAll('.dish-flyer').length + document.getAnimations().filter((a) => a.playState === 'running').length))
    .toBe(0);

test.describe('opening a dish', () => {
  test('lifts the photo off its card and sets it down in the view', async ({ page }) => {
    await boot(page);
    const cardBox = await boxOf(page, card('m11'));
    await tapCard(page, 'm11');
    const flight = await flightBoxes(page);

    // It leaves from the card...
    near(flight.start, cardBox, 3);
    // ...passes through places that are neither...
    between(flight.mid, flight.start, flight.end);
    // ...and arrives where the dish keeps its photo.
    await settle(page);
    near(flight.end, await boxOf(page, '.dish-photo'), 2);

    // While it is in the air it stands in for the real photo and the card.
    expect(flight.photoHidden).toBe('hidden');
    expect(flight.cardsHidden).toEqual(['m11']);
    // And afterwards neither is left hidden, or the copy left behind.
    await expect(page.locator('.dish-flyer')).toHaveCount(0);
    expect(await page.locator('.dish-photo').evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
    expect(await page.locator(card('m11')).evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  });

  test('opens the card’s square crop out into the whole photo', async ({ page }) => {
    await boot(page);
    await tapCard(page, 'm11');
    const { start, end } = await flightBoxes(page);
    // The card shows a square; the photo is a 4:5 portrait.
    expect(start.width / start.height).toBeCloseTo(1, 1);
    expect(end.width / end.height).toBeCloseTo(0.8, 1);
  });

  test('flies a photo fetched over the network, already on the page from its card', async ({ page }) => {
    await page.route('https://photos.test/**', (route) =>
      route.fulfill({ path: fileURLToPath(new URL('./fixtures/dish.png', import.meta.url)), contentType: 'image/png' })
    );
    await boot(page, '/', MEALS.map((m) => ({ ...m, photos: [`https://photos.test/${m.id}.png`] })));
    await expect.poll(() => page.locator('.meal-card-photo').first().evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    const cardBox = await boxOf(page, card('m11'));
    await tapCard(page, 'm11');
    const flight = await flightBoxes(page);
    near(flight.start, cardBox, 3);
    between(flight.mid, flight.start, flight.end);
    expect(flight.photoHidden).toBe('hidden');
    await settle(page);
    near(flight.end, await boxOf(page, '.dish-photo'), 2);
    await expect(page.locator('.dish-flyer')).toHaveCount(0);
  });

  test('a dish opened from a link has no card to leave, and arrives with the view', async ({ page }) => {
    await boot(page, '/?meal=m11');
    await watchForFlyers(page);
    await expect(page.locator('.dish')).toBeVisible();
    await settle(page);
    expect(await flew(page)).toBe(false);
    expect(await page.locator('.dish-photo').evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  });

  test('a dish with no photo has nothing to fly, and still opens', async ({ page }) => {
    await boot(page, '/', MEALS.map((m) => ({ ...m, photos: [] })));
    await watchForFlyers(page);
    await tapCard(page, 'm11');
    await expect(page.locator('.dish')).toBeVisible();
    await settle(page);
    expect(await flew(page)).toBe(false);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.dish')).toHaveCount(0);
    expect(await flew(page)).toBe(false);
  });
});

test.describe('the back arrow', () => {
  test('carries the photo home while the view fades away', async ({ page }) => {
    await boot(page);
    await tapCard(page, 'm11');
    await settle(page);

    const photoBox = await boxOf(page, '.dish-photo');
    await page.getByRole('button', { name: 'Back' }).click();

    // Not an immediate jump: the dish is still on the page, leaving.
    await expect(page.locator('.dish')).toHaveCount(1);
    await expect(page.locator('.dish-overlay-exiting')).toHaveCount(1);
    // The gallery comes back into focus as it goes.
    await expect(page.locator('.app-stage')).not.toHaveClass(/app-stage-receded/);

    const flight = await flightBoxes(page);
    near(flight.start, photoBox, 3);
    between(flight.mid, flight.start, flight.end);
    expect(flight.photoHidden).toBe('hidden');
    expect(flight.cardsHidden).toEqual(['m11']);

    // It lands on the card, where the card is once the gallery has settled.
    await expect(page.locator('.dish')).toHaveCount(0);
    await settle(page);
    near(flight.end, await boxOf(page, card('m11')), 2);
    await expect(page.locator('.dish-flyer')).toHaveCount(0);
    expect(await page.locator(card('m11')).evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(new URL(page.url()).searchParams.get('meal')).toBeNull();
  });

  test('flies home from wherever the sheet has been pulled to', async ({ page }) => {
    await boot(page);
    await tapCard(page, 'm11');
    await settle(page);
    // Open the sheet and collapse the header: the photo is a thumbnail.
    await page.locator('.dish-scroller').evaluate((el) => el.scrollTo({ top: 10_000, behavior: 'instant' }));
    await expect(page.locator('.dish')).toHaveAttribute('data-sheet', 'collapsed');
    const thumb = await boxOf(page, '.dish-photo');
    expect(thumb.width).toBeLessThan(80);

    await page.getByRole('button', { name: 'Back' }).click();
    const flight = await flightBoxes(page);
    near(flight.start, thumb, 3);
    await expect(page.locator('.dish')).toHaveCount(0);
    await settle(page);
    near(flight.end, await boxOf(page, card('m11')), 2);
  });

  test('lands on the card of the dish that is open, not the one that was tapped', async ({ page }) => {
    await boot(page);
    await tapCard(page, 'm12');
    await settle(page);
    await page.getByRole('button', { name: 'Previous dish' }).click();
    await expect(page.locator('.dish-hero-title .dish-name-in')).toHaveText('Dish number 11');
    await settle(page);

    await page.getByRole('button', { name: 'Back' }).click();
    const flight = await flightBoxes(page);
    expect(flight.cardsHidden).toEqual(['m11']);
    await expect(page.locator('.dish')).toHaveCount(0);
    await settle(page);
    near(flight.end, await boxOf(page, card('m11')), 2);
  });

  test('a dish whose card is off the screen leaves with the view, and is gone', async ({ page }) => {
    await boot(page);
    await tapCard(page, 'm12');
    await settle(page);
    // The shelf loops: one step on from the newest is the oldest, which is
    // at the foot of the gallery, off the screen.
    await page.getByRole('button', { name: 'Next dish' }).click();
    await expect(page.locator('.dish-hero-title .dish-name-in')).toHaveText('Dish number 1');
    await settle(page);

    await watchForFlyers(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.dish-overlay-exiting')).toHaveCount(1);
    await expect(page.locator('.dish')).toHaveCount(0);
    expect(await flew(page)).toBe(false);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  });

  test('a dish whose card is not in the gallery leaves with the view, and is gone', async ({ page }) => {
    await boot(page);
    await page.getByRole('searchbox', { name: 'Search dishes' }).fill('number 12');
    await expect(page.locator('.meal-card')).toHaveCount(1);
    await tapCard(page, 'm12');
    await settle(page);
    await page.getByRole('button', { name: 'Next dish' }).click();
    await expect(page.locator('.dish-hero-title .dish-name-in')).toHaveText('Dish number 1');
    await settle(page);

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.dish-flyer')).toHaveCount(0);
    await expect(page.locator('.dish')).toHaveCount(0);
  });

  test('takes no input while it goes, so a second Back does not go back twice', async ({ page }) => {
    await boot(page);
    await tapCard(page, 'm11');
    await settle(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.dish')).toHaveCount(0);
    // Back from the dish is one step. A second would have left the app.
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('.gallery')).toBeVisible();
  });

  test('and where inert is not supported, a second Back is still ignored', async ({ page }) => {
    // iOS before 15.5 has no `inert`, so the dish has to ignore it itself.
    await boot(page);
    await tapCard(page, 'm11');
    await settle(page);
    // Going back is counted and not done, so the dish's history entry stays
    // as it was and a second call would be seen.
    await page.evaluate(() => {
      window.__backs = 0;
      history.back = () => {
        window.__backs++;
      };
    });
    await page.evaluate(() => document.querySelector('.dish-back').click());
    await page.waitForSelector('.dish-overlay-exiting');
    await page.evaluate(() => {
      document.querySelector('.dish-overlay').removeAttribute('inert');
      document.querySelector('.dish-back').click();
      document.querySelector('.dish-overlay').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await expect(page.locator('.dish')).toHaveCount(0);
    expect(await page.evaluate(() => window.__backs)).toBe(1);
  });

  test('closed before the photo has landed, it carries on from where it is', async ({ page }) => {
    await boot(page);
    await tapCard(page, 'm11');
    await page.waitForFunction(() => document.querySelector('.dish-flyer')?.getAnimations().length > 0);
    // Part-way through the way in.
    const mid = await page.evaluate((boxSrc) => {
      const box = eval(boxSrc);
      const flyer = document.querySelector('.dish-flyer');
      const animation = flyer.getAnimations()[0];
      animation.pause();
      animation.currentTime = animation.effect.getTiming().duration / 2;
      return box(flyer);
    }, BOX);

    await page.evaluate(() => document.querySelector('.dish-back').click());
    await page.waitForSelector('.dish-flyer');
    // The new flight starts where the old one was, not at the view's photo.
    const flight = await flightBoxes(page);
    near(flight.start, mid, 3);

    await expect(page.locator('.dish')).toHaveCount(0);
    await expect(page.locator('.dish-flyer')).toHaveCount(0);
    expect(await page.locator(card('m11')).evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  });

  test('another dish tapped on the way out opens in its place', async ({ page }) => {
    await boot(page);
    await tapCard(page, 'm11');
    await settle(page);
    await page.evaluate(() => document.querySelector('.dish-back').click());
    await page.waitForSelector('.dish-overlay-exiting');
    // The gallery is already live again, behind the fading view.
    await tapCard(page, 'm9');

    await expect(page.locator('.dish')).toHaveCount(1);
    await expect(page.locator('.dish-overlay-exiting')).toHaveCount(0);
    await expect(page.locator('.dish-hero-title .dish-name-in')).toHaveText('Dish number 9');
    await settle(page);
    await expect(page.locator('.dish-flyer')).toHaveCount(0);
    // Nothing left hidden by the flight that was cut off.
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-meal-photo], .dish-photo')].filter((el) => getComputedStyle(el).visibility === 'hidden').length
      )
    ).toBe(0);
  });
});

test.describe('on a chef’s public page', () => {
  // A client reading a chef's page gets the same flight, with no depth of
  // field behind it to allow for.
  test('the photo flies out of its card and home again', async ({ page }) => {
    const rows = MEALS.map(({ id, name, cuisine, category, date, serves, photos, ingredients, method, description, note }) => ({
      id, name, cuisine, category, date, serves, photos, ingredients, method, description, note, tags: [],
    }));
    await page.route('**stub.supabase.co/**', (route) => {
      const { pathname } = new URL(route.request().url());
      const body =
        pathname === '/rest/v1/chefs' ? [{ id: 'chef-1', slug: 'ana', display_name: 'Ana', page_theme: 'light' }] : pathname === '/rest/v1/meals' ? rows : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/ana');
    await expect(page.locator('.meal-card').first()).toBeVisible();

    const cardBox = await boxOf(page, card('m11'));
    await tapCard(page, 'm11');
    const flightIn = await flightBoxes(page);
    near(flightIn.start, cardBox, 3);
    between(flightIn.mid, flightIn.start, flightIn.end);
    await settle(page);
    near(flightIn.end, await boxOf(page, '.dish-photo'), 2);

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.dish')).toHaveCount(1);
    const flightOut = await flightBoxes(page);
    await expect(page.locator('.dish')).toHaveCount(0);
    await settle(page);
    near(flightOut.end, await boxOf(page, card('m11')), 2);
    expect(await page.locator(card('m11')).evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  });
});

test.describe('with reduced motion', () => {
  // page.emulateMedia, not test.use({ reducedMotion }): see
  // dish-step-motion.spec.js.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('nothing flies: the view fades in and out, and the dish still opens and closes', async ({ page }) => {
    await boot(page);
    await watchForFlyers(page);
    await tapCard(page, 'm11');
    await expect(page.locator('.dish')).toBeVisible();
    await settle(page);
    expect(await page.locator('.dish-photo').evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');

    await page.getByRole('button', { name: 'Back' }).click();
    // It fades over a colour's time rather than going at once, and the
    // sheet, which would only jump, stays where it is.
    await expect(page.locator('.dish-overlay-exiting')).toHaveCount(1);
    const exit = await page.evaluate(() => ({
      overlay: document.querySelector('.dish-overlay-exiting').getAnimations().map((a) => a.effect.getTiming().duration),
      sheet: document.querySelector('.dish-sheet').getAnimations().length,
    }));
    expect(exit).toEqual({ overlay: [200], sheet: 0 });
    await expect(page.locator('.dish')).toHaveCount(0);
    expect(await flew(page)).toBe(false);
  });
});
