import { test, expect } from './support/network';

// The dish sheet, pinned.
//
// One scroll position carries the dish view through three states: resting
// (large name and photo, the sheet peeking), open (the sheet is the page,
// the recipe below a smaller name and photo) and collapsed (the photo a
// thumbnail beside the name, the recipe scrolling under). Every piece that
// appears in more than one state is one element travelling between them.
//
// What can break without anyone noticing is the travelling itself: a
// piece that jumps between rest positions instead of moving through the
// ones in between still looks right in a screenshot of each rest. So the
// journey is sampled and asserted as numbers.

const STEPS = [
  'Knead flour, milk, yeast, sugar, egg, and butter into a smooth yeast dough.',
  'Let dough proof until doubled in volume, then divide into round buns.',
  'Bake at 350°F until soft and golden brown, then cool completely.',
  'Whip heavy cream with condensed milk and sugar until thick and fluffy.',
  'Cut a slit in each bun and pipe in a generous amount of sweet milk cream.',
];

// A square PNG, so the photo has a real size to scale.
const PHOTO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle cx="200" cy="200" r="180" fill="#b56"/></svg>');

const MEALS = [
  {
    id: 'm2',
    name: 'Sweet milk cream buns',
    cuisine: 'Japanese',
    category: 'Dessert',
    date: '2026-09-24',
    serves: 6,
    photos: [PHOTO],
    ingredients: ['bread flour', 'heavy cream', 'condensed milk', 'whole milk', 'sugar', 'butter', 'egg'],
    // Long enough that the header can collapse all the way.
    method: [...STEPS, ...STEPS],
    description: 'Soft milk bread split and piped full of cold, sweet cream.',
    note: 'Chill the cream filling well before piping to keep its shape.',
  },
  {
    id: 'm1',
    name: 'Cacio e pepe',
    cuisine: 'Italian',
    category: 'Main',
    date: '2026-09-10',
    serves: 2,
    photos: [PHOTO],
    ingredients: ['pecorino'],
    method: [...STEPS, ...STEPS],
    description: 'Three ingredients, no hiding.',
    note: '',
  },
];

async function openDish(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript((meals) => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
  }, MEALS);
  await page.goto('/');
  await page.locator('.meal-card').first().click();
  await expect(page.locator('.dish')).toBeVisible();
  // Let the entrance finish: its `translate` would otherwise show up in
  // every bounding box read below.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}

/** The scroll distances the states sit at, read from the layout. */
async function restPoints(page) {
  return page.evaluate(() => {
    const S = document.querySelector('.dish-sheet').offsetTop;
    const slot = document.querySelector('.dish-slot-photo');
    const row = document.querySelector('.dish-head-row');
    const head = document.querySelector('.dish-head');
    const collapse = head.offsetTop + slot.offsetTop + slot.offsetHeight - (head.offsetTop + row.offsetTop + row.offsetHeight);
    return { open: S, collapsed: S + collapse };
  });
}

/**
 * Holds the sheet at `t` and reads where everything is. Snapping is
 * switched off while sampling, since a snap would move the sheet off the
 * position being asked about; snapping has its own test below.
 */
async function sampleAt(page, t) {
  return page.evaluate(async (top) => {
    const scroller = document.querySelector('.dish-scroller');
    scroller.style.scrollSnapType = 'none';
    scroller.scrollTop = top;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const opacity = (sel) => Number(getComputedStyle(document.querySelector(sel)).opacity);
    const rect = (sel) => document.querySelector(sel).getBoundingClientRect().toJSON();
    const photo = document.querySelector('.dish-photo');
    return {
      t: scroller.scrollTop,
      scale: Number(photo.style.getPropertyValue('--dish-photo-scale')),
      photo: rect('.dish-photo'),
      hero: opacity('.dish-hero-title'),
      bar: opacity('.dish-bar-title'),
      barRect: rect('.dish-bar-title'),
      peek: opacity('.dish-peek-fade'),
      body: opacity('.dish-body'),
      clip: document.querySelector('.dish-surface').style.clipPath,
      frameRadius: document.querySelector('.dish-frame').style.borderRadius,
      sheet: document.querySelector('.dish').dataset.sheet,
    };
  }, t);
}

async function sampleJourney(page, to, count = 40) {
  const samples = [];
  for (let i = 0; i <= count; i++) samples.push(await sampleAt(page, (to * i) / count));
  return samples;
}

const between = (x, lo, hi) => x > lo && x < hi;

test.describe('the dish sheet', () => {
  test('rests with the name and photo large and the sheet peeking', async ({ page }) => {
    await openDish(page);
    const rest = await sampleAt(page, 0);
    expect(rest.sheet).toBe('peek');
    expect(rest.scale).toBe(1);
    expect(rest.hero).toBe(1);
    expect(rest.bar).toBe(0);
    expect(rest.peek).toBe(1);
    expect(rest.body).toBe(0);
    await expect(page.getByRole('button', { name: 'Recipe' })).toHaveAttribute('aria-expanded', 'false');
    // The recipe is on screen for nobody yet, but it's in the page for a
    // screen reader from the start.
    await expect(page.locator('.dish-method li').first()).toHaveText(/Knead flour/);
  });

  test('pulling the sheet up moves every shared piece through the positions between', async ({ page }) => {
    await openDish(page);
    const { open, collapsed } = await restPoints(page);
    const samples = await sampleJourney(page, collapsed);

    // The photo only ever gets smaller on the way up, and never by a jump:
    // no step of 1/40th of the journey changes it by more than a fraction
    // of the whole change.
    const scales = samples.map((s) => s.scale);
    const total = scales[0] - scales.at(-1);
    expect(total).toBeGreaterThan(0.5);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThanOrEqual(scales[i - 1] + 1e-6);
      expect(scales[i - 1] - scales[i]).toBeLessThan(total / 8);
    }
    // And it passes through sizes that are neither rest.
    expect(scales.filter((s) => between(s, scales.at(-1) + 0.02, 0.98)).length).toBeGreaterThan(10);

    // The large name hands over to the small one: there is a moment with
    // both part-visible, rather than one cutting to the other.
    expect(samples.some((s) => between(s.hero, 0, 1) && between(s.bar, 0, 1))).toBe(true);

    // The card's summary is gone before the recipe arrives.
    const summaryGone = samples.findIndex((s) => s.peek === 0);
    const recipeArrives = samples.findIndex((s) => s.body > 0);
    expect(summaryGone).toBeGreaterThan(0);
    expect(recipeArrives).toBeGreaterThan(summaryGone);

    // The card's lower corners flatten into the screen's across the drag,
    // not at the end. Its top corners never do: see the next test.
    const radii = samples
      .filter((s) => s.t < open)
      .map((s) => Number(/([\d.]+)px$/.exec(s.frameRadius)?.[1]));
    expect(new Set(radii.map((r) => r.toFixed(1))).size).toBeGreaterThan(10);
  });

  test('open, the sheet is the page', async ({ page }) => {
    await openDish(page);
    const { open } = await restPoints(page);
    const s = await sampleAt(page, open);
    expect(s.sheet).toBe('open');
    expect(s.hero).toBe(0);
    expect(s.bar).toBe(1);
    expect(s.body).toBe(1);
    // Flush with the sides, and like any bottom sheet, rounded at the top:
    // nothing in the app has a square corner.
    expect(s.clip).toBe('inset(0px round 18px 18px 0px 0px)');
    // The photo, smaller and centred.
    expect(s.scale).toBeLessThan(1);
    const width = await page.locator('.dish').evaluate((el) => el.clientWidth);
    expect(Math.abs(s.photo.x + s.photo.width / 2 - width / 2)).toBeLessThan(1.5);
    await expect(page.getByRole('button', { name: 'Previous dish' })).toBeVisible();
  });

  test('collapsed, the photo is a thumbnail beside a left-aligned name', async ({ page }) => {
    await openDish(page);
    const { collapsed } = await restPoints(page);
    const s = await sampleAt(page, collapsed);
    expect(s.sheet).toBe('collapsed');

    const slots = await page.evaluate(() => ({
      thumb: document.querySelector('.dish-slot-thumb').getBoundingClientRect().toJSON(),
      head: document.querySelector('.dish-head-text').getBoundingClientRect().toJSON(),
    }));
    // The photo fills its thumbnail slot...
    expect(Math.abs(s.photo.x - slots.thumb.x)).toBeLessThan(1.5);
    expect(Math.abs(s.photo.y - slots.thumb.y)).toBeLessThan(1.5);
    expect(Math.abs(s.photo.width - slots.thumb.width)).toBeLessThan(1.5);
    // ...the name has slid to the left edge of the header...
    expect(Math.abs(s.barRect.x - slots.head.x)).toBeLessThan(1.5);
    // ...and the arrows have gone, from sight and from the tab order.
    await expect(page.getByRole('button', { name: 'Previous dish' })).toBeHidden();
  });

  test('a release between resting and open settles on one of them', async ({ page }) => {
    await openDish(page);
    const { open } = await restPoints(page);
    const settle = (t) =>
      page.evaluate(async (top) => {
        const scroller = document.querySelector('.dish-scroller');
        scroller.scrollTop = top;
        await new Promise((r) => setTimeout(r, 400));
        return scroller.scrollTop;
      }, t);

    expect(await settle(open * 0.3)).toBe(0);
    expect(Math.abs((await settle(open * 0.7)) - open)).toBeLessThan(1);
    // Once open, the recipe scrolls freely: no snapping inside it.
    expect(Math.abs((await settle(open + 120)) - (open + 120))).toBeLessThan(1);
  });

  // Free scrolling inside the open sheet only holds while the sheet covers
  // the whole view, and Chrome judges that at the *requested* position,
  // before clamping it to the end. So anything that asks for a position
  // past the end of the recipe -- another wheel tick at the bottom, the
  // End key, a fling with momentum left -- found the sheet not covering
  // the view there and snapped to a rest instead: straight back to the
  // resting state, the whole recipe gone from under the reader.
  test('asking to scroll past the end of a recipe stays at the end', async ({ page }) => {
    await openDish(page);
    const { open } = await restPoints(page);
    const scroller = page.locator('.dish-scroller');
    const at = () => scroller.evaluate((el) => ({ t: el.scrollTop, max: el.scrollHeight - el.clientHeight }));

    await scroller.evaluate((el, top) => (el.scrollTop = top), open);
    await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);
    let pos = await at();
    expect(pos.max).toBeGreaterThan(open);
    expect(pos.t).toBeCloseTo(pos.max, 0);

    // A wheel tick past the end, and the End key from the top.
    const box = await page.locator('.dish').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(600);
    pos = await at();
    expect(pos.t).toBeCloseTo(pos.max, 0);

    await scroller.evaluate((el, top) => (el.scrollTop = top), open);
    await scroller.focus();
    await page.keyboard.press('End');
    await expect.poll(async () => (await at()).t).toBeCloseTo(pos.max, 0);
  });

  // A finger, not scrollTop. Raw touch points through the DevTools
  // protocol, since that is what reaches the compositor's scrolling: both
  // Playwright's touchscreen (taps only) and Input.synthesizeScrollGesture
  // (which the headless shell ignores) leave the sheet where it was.
  test('a drag that starts on the photo pulls the sheet, and settles where it is let go', async ({ page }) => {
    await openDish(page);
    const { open } = await restPoints(page);
    const cdp = await page.context().newCDPSession(page);
    const scrollTop = () => page.locator('.dish-scroller').evaluate((el) => Math.round(el.scrollTop));
    const drag = async (from, dy) => {
      const at = (i) => [{ x: from.x, y: from.y + (dy * i) / 20, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
      for (let i = 1; i <= 20; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
        await page.waitForTimeout(16);
      }
      // Held still before lifting, so the release carries no fling.
      await page.waitForTimeout(120);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };

    // The photo is in the layer above the scroller; the drag has to fall
    // through it.
    const box = await page.locator('.dish-photo').boundingBox();
    const onPhoto = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await drag(onPhoto, -open * 0.3);
    await expect.poll(scrollTop).toBe(0);
    await drag(onPhoto, -open * 0.65);
    await expect.poll(scrollTop).toBe(open);
    await expect(page.locator('.dish')).toHaveAttribute('data-sheet', 'open');
  });

  test('the handle and the resting card open the sheet, and the handle closes it', async ({ page }) => {
    await openDish(page);
    const { open } = await restPoints(page);
    const scrollTop = () => page.locator('.dish-scroller').evaluate((el) => el.scrollTop);
    const handle = page.getByRole('button', { name: 'Recipe' });

    await handle.click();
    await expect.poll(scrollTop).toBeCloseTo(open, 0);
    await expect(handle).toHaveAttribute('aria-expanded', 'true');

    // Keyboard, since open the handle sits under the header.
    await handle.focus();
    await page.keyboard.press('Enter');
    await expect.poll(scrollTop).toBe(0);
    await expect(handle).toHaveAttribute('aria-expanded', 'false');

    // Anywhere on the resting card opens it too.
    await page.locator('.dish-lede').click();
    await expect.poll(scrollTop).toBeCloseTo(open, 0);
  });

  test('the thumbnail leads back up to the photo', async ({ page }) => {
    await openDish(page);
    const { open, collapsed } = await restPoints(page);
    await sampleAt(page, collapsed + 200);
    await page.locator('.dish-scroller').evaluate((el) => (el.style.scrollSnapType = ''));
    await page.locator('.dish-photo').click();
    await expect.poll(() => page.locator('.dish-scroller').evaluate((el) => el.scrollTop)).toBeCloseTo(open, 0);
  });

  test('stepping from part-way down a recipe opens the next one at its top', async ({ page }) => {
    await openDish(page);
    const { open, collapsed } = await restPoints(page);
    await sampleAt(page, collapsed + 300);
    await page.locator('.dish-scroller').evaluate((el) => (el.style.scrollSnapType = ''));
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.dish-hero-title .dish-name-in')).toHaveText('Cacio e pepe');
    await expect.poll(() => page.locator('.dish-scroller').evaluate((el) => el.scrollTop)).toBeCloseTo(open, 0);
  });

  // page.emulateMedia rather than test.use({ reducedMotion }), for the
  // reason given in dish-step-motion.spec.js.
  test('reduced motion swaps the travelling pieces between rests instead of moving them', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDish(page);
    const { collapsed } = await restPoints(page);
    const samples = await sampleJourney(page, collapsed);

    // Only ever at one of its three rest sizes...
    const rests = [...new Set(samples.map((s) => s.scale.toFixed(4)))];
    expect(rests.length).toBe(3);
    // ...and the names are each either there or not.
    for (const s of samples) {
      expect([0, 1]).toContain(Math.round(s.hero * 1000) / 1000);
    }
    // What only fades still fades: the card's summary passes through
    // partial opacity on the way out.
    expect(samples.some((s) => between(s.peek, 0, 1))).toBe(true);
  });
});
