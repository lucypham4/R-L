import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// Every field on the add-meal card is the same height, the date included.
//
// iOS Safari draws a date input itself: left alone it ignores the field's
// height, grows to its own, and sets the date at the top of that with white
// space under it. WebKit isn't in this suite's browser (Chromium only), so
// this can't reproduce that; it holds the box to the same size in Chromium
// and checks the rules that give WebKit its box back are on the field. The
// one real check is by hand, in Safari on an iPhone.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

const AI_FILL = {
  name: 'Charred leek, hazelnut',
  date: '2026-09-26',
  description: 'Leeks charred over coals and finished with brown butter.',
  summary: 'Charred leeks under brown butter.',
  cuisine: 'French',
  category: 'Starter',
  ingredients: ['leek', 'brown butter'],
  method: ['Char the leeks.'],
  note: '',
};

async function toStep3(page) {
  await page.route('**stub.supabase.co/**', (route) => {
    const url = route.request().url();
    if (url.includes('/functions/v1/ai-fill')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AI_FILL) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: url.includes('/auth/v1/') ? '{}' : '[]' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.setInputFiles('#photo', DISH_PHOTO);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.locator('.photo-crop-card')).toBeHidden();
  await page.locator('.add-meal-next').click();
  await page.locator('textarea').first().fill('Leeks on the coals, brown butter, hazelnuts.');
  await page.locator('.add-meal-next').click();
  await expect(page.locator('.add-meal-progress')).toHaveText(/Step 3 of 3/);
  await expect(page.locator('#meal-name')).toHaveValue(AI_FILL.name);
}

const heightOf = (locator) => locator.evaluate((el) => el.getBoundingClientRect().height);

test.describe('field heights on the card', () => {
  test('the date, filled or empty, is as tall as the other inputs', async ({ page }) => {
    await toStep3(page);
    const name = await heightOf(page.locator('#meal-name'));
    const serves = await heightOf(page.locator('#meal-serves'));
    expect(name).toBe(46);
    expect(serves).toBe(name);
    expect(await heightOf(page.locator('#meal-date'))).toBe(name);

    // An empty date input is the case WebKit collapses.
    await page.locator('#meal-date').fill('');
    await expect(page.locator('#meal-date')).toHaveValue('');
    expect(await heightOf(page.locator('#meal-date'))).toBe(name);
  });

  test('the date field takes its box back from the browser and centres its text', async ({ page }) => {
    await toStep3(page);
    const date = await page.locator('#meal-date').evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        appearance: cs.appearance,
        minHeight: cs.minHeight,
        lineHeight: cs.lineHeight,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
      };
    });
    // appearance: none is what lets iOS honour the height at all.
    expect(date.appearance).toBe('none');
    expect(date.minHeight).toBe('46px');
    // The line is as tall as the room inside the borders (46 less 2), so the
    // text is centred whichever way the browser aligns it.
    expect(date.lineHeight).toBe('44px');
    expect(date.paddingTop).toBe('0px');
    expect(date.paddingBottom).toBe('0px');
  });

  test('the same holds at 375px, where the row is a single column', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await toStep3(page);
    expect(await heightOf(page.locator('#meal-date'))).toBe(46);
    const box = await page.locator('#meal-date').boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  });
});
