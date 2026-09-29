import { test, expect } from './support/network';

// The tour's dish illustrations, pinned.
//
// Three things have gone wrong here before, and each has a test:
//
//   1. Art that does not move. The Rive cat shipped with timelines that
//      were named correctly and contained no keyframes, so it never
//      animated, and a still illustration is a perfectly good-looking
//      screenshot. Nothing caught it.
//   2. Art that is cropped. The WebGL version framed each scene with a
//      camera, and anything outside the frustum was simply gone. These
//      are the chef's own plating; losing the edge of a dish is not a
//      rendering detail.
//   3. Reduced motion removing the picture along with the movement.

const SCENES = ['dessert', 'soup', 'archive', 'zucchini'];

async function openTour(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  // Deliberately no onboarding-seen flag: the tour is the thing under test.
  await page.goto('/');
  await expect(page.locator('.onboarding-art')).toBeVisible();
  await page.waitForTimeout(900);
}

/** True if the illustration's pixels differ across ~700ms. */
async function illustrationMoves(page) {
  const art = page.locator('.onboarding-art');
  const before = await art.screenshot();
  await page.waitForTimeout(700);
  return Buffer.compare(before, await art.screenshot()) !== 0;
}

/**
 * The largest amount, in pixels, by which any layer escapes the stage --
 * negative when every layer is comfortably inside. Sampled repeatedly,
 * because the peak of a scale or a drop is transient and a single reading
 * lands between them.
 */
async function worstOverflow(page, samples = 14) {
  let worst = -Infinity;
  for (let i = 0; i < samples; i++) {
    const over = await page.locator('.scene-stage').evaluate((stage) => {
      const s = stage.getBoundingClientRect();
      return Math.max(
        ...[...stage.querySelectorAll('img')].map((im) => {
          const r = im.getBoundingClientRect();
          return Math.max(s.left - r.left, r.right - s.right, s.top - r.top, r.bottom - s.bottom);
        })
      );
    });
    worst = Math.max(worst, over);
    await page.waitForTimeout(170);
  }
  return worst;
}

test.describe('onboarding illustrations', () => {
  test('every scene renders, moves, and stays inside its box', async ({ page }) => {
    await openTour(page);

    for (const [i, name] of SCENES.entries()) {
      await page.waitForTimeout(600);

      // Every layer has actually decoded -- a broken src still occupies
      // layout, so counting elements alone would pass on missing art.
      //
      // Polled rather than read once: the archive rewrites its slots'
      // src several times a second, and an image is briefly not
      // `complete` while the new one decodes. That is a moment, not a
      // fault, and asserting on a single sample makes this flaky.
      await expect
        .poll(
          async () =>
            page.locator('.scene-stage').evaluate((s) => {
              const imgs = [...s.querySelectorAll('img')];
              return imgs.length > 0 && imgs.every((im) => im.complete && im.naturalWidth > 0);
            }),
          { message: `${name}: every layer loaded`, timeout: 5000 }
        )
        .toBe(true);

      expect(await illustrationMoves(page), `${name}: animates`).toBe(true);
      // A shade of tolerance for sub-pixel rounding; a real crop is tens
      // of pixels, not fractions of one.
      expect(await worstOverflow(page), `${name}: nothing cropped`).toBeLessThan(1);

      if (i < SCENES.length - 1) await page.getByRole('button', { name: /next/i }).click();
    }
  });

  test('the soup assembles rather than appearing at once', async ({ page }) => {
    await openTour(page);
    await page.getByRole('button', { name: /next/i }).click();

    // Sample a full loop and watch each garnish cross into view. If the
    // layers were one flat image, or all shared one keyframe, every layer
    // would reach full opacity in the same frame.
    const seen = { bread: false, swirl: false, chives: false, almonds: false };
    const partial = { bread: false, swirl: false, chives: false, almonds: false };
    for (let i = 0; i < 60; i++) {
      const o = await page.locator('.scene-stage').evaluate(() => {
        const read = (cls) => Number(getComputedStyle(document.querySelector(cls)).opacity);
        return {
          bread: read('.soup-bread'),
          swirl: read('.soup-swirl'),
          chives: read('.soup-chives'),
          almonds: read('.soup-almonds'),
        };
      });
      for (const k of Object.keys(seen)) {
        if (o[k] > 0.9) seen[k] = true;
        if (o[k] < 0.1) partial[k] = true;
      }
      await page.waitForTimeout(200);
    }
    for (const k of Object.keys(seen)) {
      expect(seen[k], `${k} becomes visible`).toBe(true);
      expect(partial[k], `${k} is absent earlier in the loop`).toBe(true);
    }
  });

  test('the archive cycles through more than one dish per slot', async ({ page }) => {
    await openTour(page);
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByRole('button', { name: /next/i }).click();
    await expect(page.locator('.archive-slot')).toHaveCount(9);

    const firstSlot = page.locator('.archive-slot img').first();
    const seen = new Set();
    for (let i = 0; i < 24; i++) {
      seen.add(await firstSlot.getAttribute('src'));
      await page.waitForTimeout(140);
    }
    expect(seen.size, 'a slot riffles through several dishes').toBeGreaterThan(2);
  });

  test('reduced motion keeps the picture and drops the movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openTour(page);

    await expect(page.locator('.onboarding-art')).toBeVisible();
    expect(await illustrationMoves(page), 'held still').toBe(false);

    // The soup is the one that could go blank: its layers are hidden by
    // the opening frames of their own animations, so switching the
    // animations off has to leave them visible rather than at 0.
    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForTimeout(500);
    const opacities = await page.locator('.scene-stage').evaluate((s) =>
      [...s.querySelectorAll('img')].map((im) => Number(getComputedStyle(im).opacity))
    );
    expect(opacities.length).toBe(5);
    expect(opacities.every((o) => o > 0.95), 'every layer of the soup is shown').toBe(true);
  });
});
