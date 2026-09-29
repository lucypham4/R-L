import { test, expect } from './support/network';

// The tour's 3D illustrations, pinned.
//
// The art this replaced shipped broken: the Rive file's timelines existed
// and were named correctly, and contained no keyframes, so the cat never
// moved. Nothing caught it because a still illustration is a perfectly
// good-looking screenshot.
//
// Note the shape of the check. Reading pixels back off a WebGL canvas from
// JS does NOT work here -- the drawing buffer is cleared after compositing
// unless preserveDrawingBuffer is set, so drawImage(canvas) outside the
// render loop hands back a blank image and every scene looks broken
// whether or not it is. That cost a detour. Screenshots go through the
// browser's compositor and do see the canvas, so two of them a beat apart
// is a real motion check.

const SCENES = ['plate', 'bowl', 'archive', 'share'];

async function openTour(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  // Deliberately no onboarding-seen flag: the tour is the thing under test.
  await page.goto('/');
  await expect(page.locator('.onboarding-art')).toBeVisible();
  // The scene chunk is lazy-loaded; give it a beat to mount and start.
  await page.waitForTimeout(1200);
}

/** True if the illustration's pixels differ across ~600ms. */
async function illustrationMoves(page) {
  const art = page.locator('.onboarding-art');
  const before = await art.screenshot();
  await page.waitForTimeout(600);
  const after = await art.screenshot();
  return Buffer.compare(before, after) !== 0;
}

test.describe('onboarding illustrations', () => {
  test('every scene renders and moves', async ({ page }) => {
    await openTour(page);

    for (const [i, name] of SCENES.entries()) {
      await page.waitForTimeout(700);

      // Rendered at a real size, not the canvas's 300x150 intrinsic default.
      const size = await page.locator('.onboarding-art-canvas').evaluate((c) => ({
        w: c.width,
        h: c.height,
      }));
      expect(size.w, `${name}: canvas has width`).toBeGreaterThan(200);
      expect(size.h, `${name}: canvas has height`).toBeGreaterThan(150);

      expect(await illustrationMoves(page), `${name}: illustration animates`).toBe(true);

      if (i < SCENES.length - 1) {
        await page.getByRole('button', { name: /next/i }).click();
      }
    }
  });

  test('reduced motion holds the illustration still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openTour(page);

    // Still drawn -- losing the motion is the point, losing the picture
    // would be a worse answer for the same reader.
    const art = page.locator('.onboarding-art');
    await expect(art).toBeVisible();
    const shot = await art.screenshot();
    expect(shot.length).toBeGreaterThan(1000);

    expect(await illustrationMoves(page), 'held on its first frame').toBe(false);
  });

  test('the canvas is labelled for screen readers', async ({ page }) => {
    await openTour(page);
    // A canvas is opaque to assistive tech, so the slot carries the
    // description instead.
    await expect(page.getByRole('img', { name: /plated dish/i })).toBeVisible();
  });
});
