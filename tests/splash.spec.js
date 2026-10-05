import { test, expect } from './support/network';

// The app opens on one frame: "Staj" in steel, a glint run across it once,
// then a dissolve into the app underneath. Once a visit, and a tap skips it.

test.use({ splash: true });

test.beforeEach(async ({ page }) => {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript(() => localStorage.setItem('onboarding-seen-local', '1'));
});

// Where the glint's layer sits: 100% is off the word's left, 0% off its right.
const glintAt = (page) =>
  page.locator('.splash-word').evaluate((el) => parseFloat(getComputedStyle(el).backgroundPositionX));

test('the app opens on the wordmark, a glint crosses it once, and it dissolves into the app', async ({ page }) => {
  await page.goto('/');
  const splash = page.getByTestId('splash');
  await expect(splash).toBeVisible();
  await expect(page.locator('.splash-word')).toHaveText('Staj');
  // The app is already there underneath, ready to be uncovered.
  await expect(page.locator('.bottom-nav')).toBeAttached();

  await expect(splash).toHaveClass(/splash-shine/);
  const animations = await page
    .locator('.splash-word')
    .evaluate((el) => el.getAnimations().map((a) => a.animationName));
  expect(animations).toContain('splash-glint');

  // Off the left before it starts, across, and off the right at the end.
  const positions = await page.locator('.splash-word').evaluate((el) => {
    const a = el.getAnimations().find((x) => x.animationName === 'splash-glint');
    a.pause();
    const { delay, duration } = a.effect.getTiming();
    return [0, 0.5, 1].map((f) => {
      a.currentTime = delay + duration * f;
      return parseFloat(getComputedStyle(el).backgroundPositionX);
    });
  });
  expect(positions[0]).toBeCloseTo(100, 0);
  expect(positions[1]).toBeGreaterThan(0);
  expect(positions[1]).toBeLessThan(100);
  expect(positions[2]).toBeCloseTo(0, 0);
  await page.locator('.splash-word').evaluate((el) => el.getAnimations().forEach((a) => a.play()));

  // Cross-fades out rather than cutting: part-way, both are there. Polled
  // every frame, since the fade is over in half a second.
  const mid = await page.waitForFunction(
    () => {
      const el = document.querySelector('.splash-leave');
      const o = el && parseFloat(getComputedStyle(el).opacity);
      return o > 0.05 && o < 0.95 ? o : null;
    },
    null,
    { polling: 'raf', timeout: 4000 }
  );
  expect(await mid.jsonValue()).toBeGreaterThan(0);
  await expect(splash).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('.gallery-title')).toBeVisible();
});

test('it plays once a visit: a reload goes straight to the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('splash')).toHaveCount(0, { timeout: 6000 });
  await page.reload();
  await expect(page.locator('.gallery-title')).toBeVisible();
  await expect(page.getByTestId('splash')).toHaveCount(0);
});

test('a tap skips it, without reaching what is underneath', async ({ page }) => {
  await page.goto('/');
  const splash = page.getByTestId('splash');
  await expect(splash).toHaveClass(/splash-shine/);
  // Tap where the gallery's profile picture is under the frame.
  const avatar = await page.getByRole('button', { name: 'My profile' }).boundingBox();
  await page.mouse.click(avatar.x + avatar.width / 2, avatar.y + avatar.height / 2);
  await expect(splash).toHaveCount(0, { timeout: 2000 });
  await expect(page.locator('.gallery-title')).toBeVisible();
  await expect(page.locator('.profile-page')).toHaveCount(0);
});

test.describe('with reduced motion', () => {
  // page.emulateMedia rather than test.use({ reducedMotion }), as in
  // dish-step-motion.spec.js.
  test('the wordmark holds without the glint running across it, then fades', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const splash = page.getByTestId('splash');
    await expect(splash).toHaveClass(/splash-shine/);
    const animations = await page
      .locator('.splash-word')
      .evaluate((el) => el.getAnimations().map((a) => a.animationName).filter(Boolean));
    expect(animations).not.toContain('splash-glint');
    expect(await glintAt(page)).toBeCloseTo(100, 0);
    await expect(splash).toHaveCount(0, { timeout: 4000 });
  });
});
