import { test, expect } from './support/network';
import { PNG } from 'pngjs';

// The tour's dish scenes, pinned.
//
// Three things have gone wrong here across as many rewrites, and each one
// has a test:
//
//   1. Art that does not move. The Rive cat shipped with timelines that
//      were named correctly and contained no keyframes, so it never
//      animated -- and a still illustration is a perfectly good-looking
//      screenshot. Nothing caught it.
//   2. Art that is cropped. A camera crops silently: there is no element
//      box to measure, and geometry outside the frustum is simply not
//      drawn. These are the chef's own plating, so losing the edge of a
//      dish is not a rendering detail.
//   3. Reduced motion taking the picture away along with the movement.
//
// The scenes render to a canvas, so all of this is measured in pixels.

const SCENES = ['dessert', 'soup', 'archive', 'zucchini'];

// Every assertion here is made by screenshotting and reading pixels, and
// a scene has to be watched across a cycle rather than sampled once, so
// these run long by the standards of the rest of the suite.
test.describe.configure({ timeout: 120_000 });

async function openTour(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  // Deliberately no onboarding-seen flag: the tour is the thing under test.
  await page.goto('/');
  await expect(page.locator('.scene-canvas')).toBeVisible();
  await waitForDish(page);
}

function pixels(buf) {
  const png = PNG.sync.read(buf);
  const bg = [png.data[0], png.data[1], png.data[2]];
  const at = (x, y) => {
    const i = (y * png.width + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  const isBg = (p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) <= 14;
  return { width: png.width, height: png.height, at, isBg };
}

/** How much of the frame the dish covers, as a percentage. */
function coverage(buf) {
  const p = pixels(buf);
  let n = 0;
  let total = 0;
  for (let y = 0; y < p.height; y += 3) {
    for (let x = 0; x < p.width; x += 3) {
      total++;
      if (!p.isBg(p.at(x, y))) n++;
    }
  }
  return (n / total) * 100;
}

/** Pixels of dish touching the border of the frame -- i.e. being cropped. */
function edgeContact(buf) {
  const p = pixels(buf);
  let n = 0;
  for (let x = 0; x < p.width; x++) {
    if (!p.isBg(p.at(x, 0))) n++;
    if (!p.isBg(p.at(x, p.height - 1))) n++;
  }
  for (let y = 0; y < p.height; y++) {
    if (!p.isBg(p.at(0, y))) n++;
    if (!p.isBg(p.at(p.width - 1, y))) n++;
  }
  return n;
}

/** The frame's mean colour, as a coarse fingerprint. Different dishes
 *  are different colours, so this changes as the archive cycles, where
 *  coverage does not -- the silhouettes are all the same size. */
function meanColour(buf) {
  const p = pixels(buf);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < p.height; y += 4) {
    for (let x = 0; x < p.width; x += 4) {
      const c = p.at(x, y);
      r += c[0];
      g += c[1];
      b += c[2];
      n++;
    }
  }
  return `${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)}`;
}

/** Green pixels, which on a bowl of squash soup means garnish. */
function greenish(buf) {
  const p = pixels(buf);
  let n = 0;
  for (let y = 0; y < p.height; y += 2) {
    for (let x = 0; x < p.width; x += 2) {
      const [r, g, b] = p.at(x, y);
      if (g > r + 6 && g > b + 16 && g > 55) n++;
    }
  }
  return n;
}

/** Waits until the scene has actually drawn something. */
async function waitForDish(page) {
  await expect
    .poll(async () => coverage(await page.locator('.onboarding-art').screenshot()), { timeout: 20000 })
    .toBeGreaterThan(4);
}

async function sample(page, count, gapMs, fn) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(fn(await page.locator('.onboarding-art').screenshot()));
    await page.waitForTimeout(gapMs);
  }
  return out;
}

test.describe('onboarding dish scenes', () => {
  // One test per scene rather than one loop over four. Every assertion
  // here costs a screenshot, and a single test taking forty-odd of them
  // runs past the timeout once two workers are competing for the GPU.
  for (const [index, name] of SCENES.entries()) {
    test(`the ${name} scene draws, moves, and is never cropped`, async ({ page }) => {
      await openTour(page);
      for (let i = 0; i < index; i++) await page.getByRole('button', { name: /next/i }).click();
      await waitForDish(page);

      const art = page.locator('.onboarding-art');

      // Drawn at all -- a scene that failed to build leaves a canvas of
      // the right size showing nothing.
      const shot = await art.screenshot();
      expect(coverage(shot), 'draws a dish').toBeGreaterThan(4);

      // Moving: two frames a beat apart differ.
      await page.waitForTimeout(650);
      expect(Buffer.compare(shot, await art.screenshot()) !== 0, 'animates').toBe(true);

      // Never reaching the frame's border. A few pixels would be
      // antialiasing on a shadow; a real crop is hundreds.
      const worst = Math.max(...(await sample(page, 8, 220, edgeContact)));
      expect(worst, 'nothing runs off the frame').toBeLessThan(12);
    });
  }

  test('the soup assembles rather than arriving finished', async ({ page }) => {
    await openTour(page);
    await page.getByRole('button', { name: /next/i }).click();
    await waitForDish(page);

    // Across one 11s cycle the garnish has to both appear and be absent.
    // Baked into one texture the green count would never change; sharing
    // one keyframe it would never be partial.
    const green = await sample(page, 26, 450, greenish);
    const max = Math.max(...green);
    const min = Math.min(...green);
    expect(max, 'garnish appears').toBeGreaterThan(30);
    expect(min, 'and is absent earlier in the cycle').toBeLessThan(max * 0.3);
  });

  test('the archive riffles through the collection', async ({ page }) => {
    await openTour(page);
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: /next/i }).click();
    await waitForDish(page);

    // Nine dishes swapping textures several times a second. Compared by
    // coverage rather than by bytes, so one changed pixel is not a swap.
    const seen = new Set(await sample(page, 12, 200, meanColour));
    expect(seen.size, 'the grid keeps changing').toBeGreaterThan(3);
  });

  test('reduced motion keeps the dish and drops the movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openTour(page);

    const art = page.locator('.onboarding-art');
    const first = await art.screenshot();
    // The picture stays. Losing it would be a worse answer for the same
    // reader than holding it still.
    expect(coverage(first), 'still draws the dish').toBeGreaterThan(4);

    await page.waitForTimeout(900);
    expect(Buffer.compare(first, await art.screenshot()) === 0, 'held still').toBe(true);
  });

  test('the canvas is described for screen readers', async ({ page }) => {
    await openTour(page);
    // A canvas is opaque to assistive tech, so the slot carries the
    // description instead.
    await expect(page.getByRole('img', { name: /ice cream|chocolate/i })).toBeVisible();
  });
});
