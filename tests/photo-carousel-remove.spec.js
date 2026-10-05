import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// The × on a photo's thumbnail in the add-meal carousel is the same badge as
// the gallery's edit mode (DeleteBadge): a neutral round ×, hanging off the
// thumbnail's top-right corner. The thumbnails sit in a scroller, which
// clips whatever hangs outside it, so it took some care to show the whole
// badge, and the ring round the chosen thumbnail, rather than a cut-off
// corner of each.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('meal-diary-local-meals', '[]');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.add-meal-card')).toBeVisible();
}

async function addPhoto(page) {
  await page.setInputFiles('#photo', DISH_PHOTO);
  await expect(page.locator('.photo-crop-card')).toBeVisible();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.locator('.photo-crop-card')).toBeHidden();
}

const settle = (page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));

test.describe('removing a photo from the carousel', () => {
  test('the × is the gallery’s badge, hung off the thumbnail, and not clipped by the queue', async ({ page }) => {
    await boot(page);
    await addPhoto(page);
    await addPhoto(page);
    await settle(page);

    const wraps = page.locator('.photo-carousel-thumb-wrap');
    await expect(wraps).toHaveCount(2);
    const queue = await page.locator('.photo-carousel-queue').boundingBox();

    for (let i = 0; i < 2; i++) {
      const wrap = wraps.nth(i);
      const badge = await wrap.getByRole('button', { name: `Remove photo ${i + 1}` }).boundingBox();
      const thumb = await wrap.locator('.photo-carousel-thumb').boundingBox();

      // The gallery's badge at a size for a 52px thumbnail: 20 round, hung
      // 8px past its right edge and 6px above its top, in the same
      // proportion as the gallery's 26 on a photo.
      expect(badge.width).toBe(20);
      expect(badge.height).toBe(20);
      expect(badge.x + badge.width - (thumb.x + thumb.width), `thumbnail ${i}, right`).toBeCloseTo(8, 0);
      expect(thumb.y - badge.y, `thumbnail ${i}, top`).toBeCloseTo(6, 0);

      // All of it is inside the queue, so none of it is clipped.
      expect(badge.x, `thumbnail ${i}, badge left`).toBeGreaterThanOrEqual(queue.x);
      expect(badge.y, `thumbnail ${i}, badge top`).toBeGreaterThanOrEqual(queue.y);
      expect(badge.x + badge.width, `thumbnail ${i}, badge right`).toBeLessThanOrEqual(queue.x + queue.width);
    }

    // The ring round the chosen thumbnail (2px, offset 1px) fits too.
    const active = await page.locator('.photo-carousel-thumb-active').boundingBox();
    expect(active.x - 3).toBeGreaterThanOrEqual(queue.x);

    // The same neutral fill and drawn icon as the gallery's.
    const badge = page.getByRole('button', { name: 'Remove photo 1' });
    await expect(badge.locator('svg')).toHaveCount(1);
    await expect(badge).toHaveText('');
    const { fill, lineStrong, danger } = await badge.evaluate((el) => {
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

  test('it takes the photo off, and can be reached from the keyboard', async ({ page }) => {
    await boot(page);
    await addPhoto(page);
    await expect(page.locator('.photo-carousel-thumb-wrap')).toHaveCount(1);

    const remove = page.getByRole('button', { name: 'Remove photo 1' });
    await remove.focus();
    await expect(remove).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.photo-carousel-thumb-wrap')).toHaveCount(0);
  });
});
