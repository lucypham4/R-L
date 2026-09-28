import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// `serves` was a column with a default and no input behind it. The recipe
// card printed "Serves {meal.serves}" and every meal ever saved went in as
// 2, so every dish claimed to serve two people -- on the card and on the
// image chefs hand to clients. Meals predating the column rendered a
// dangling "Serves" with nothing after it.
//
// Two invariants now: what the card says is what the chef typed, and when
// the chef was never asked, the card says nothing at all.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

const LEGACY_MEAL = {
  id: 'legacy-1',
  name: 'Older dish',
  cuisine: 'French',
  category: 'Main',
  date: '2026-01-05',
  photos: [],
  ingredients: [],
  method: [],
  description: 'Logged before the field existed.',
  note: '',
  // No `serves` key at all -- exactly how meals were stored before.
};

async function boot(page, meals = []) {
  await page.route('**stub.supabase.co/**', (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript((m) => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('meal-diary-local-meals', JSON.stringify(m));
  }, meals);
  await page.goto('/');
}

test.describe('how many a dish served', () => {
  test('the card reports what the chef typed', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await page.setInputFiles('#photo', DISH_PHOTO);
    await page.getByRole('button', { name: 'Use photo' }).click();
    await page.locator('.add-meal-next').click();
    await page.locator('textarea').first().fill('A dish for a long table.');
    await page.locator('.add-meal-next').click();
    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);

    // Pre-filled with the value every meal used to claim silently. The
    // point of the field is that it is now visible and changeable.
    await expect(page.locator('#meal-serves')).toHaveValue('2');

    await page.locator('#meal-name').fill('Whole turbot');
    await page.locator('#meal-date').fill('2026-09-26');
    await page.locator('#meal-serves').fill('12');
    await page.getByRole('button', { name: /save/i }).click();

    await expect(page.locator('.meal-card')).toHaveCount(1);
    await page.locator('.meal-card').first().click();
    await expect(page.locator('.modal-text-sub')).toContainText('Serves 12');
    await expect(page.locator('.modal-text-sub')).not.toContainText('Serves 2,');
  });

  test('a meal that was never asked claims nothing', async ({ page }) => {
    await boot(page, [LEGACY_MEAL]);
    await page.locator('.meal-card').first().click();

    const sub = page.locator('.modal-text-sub');
    await expect(sub).toContainText('French');
    // Neither a made-up number nor the dangling label the old markup left.
    await expect(sub).not.toContainText(/Serves/i);
    await expect(sub).not.toContainText(/·\s*$/);
  });

  test('rejects a serving count the card could not print honestly', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.setInputFiles('#photo', DISH_PHOTO);
    await page.getByRole('button', { name: 'Use photo' }).click();
    await page.locator('.add-meal-next').click();
    await page.locator('textarea').first().fill('Notes.');
    await page.locator('.add-meal-next').click();

    await page.locator('#meal-name').fill('Test dish');
    await page.locator('#meal-date').fill('2026-09-26');
    await page.locator('#meal-serves').fill('0');
    await page.getByRole('button', { name: /save/i }).click();

    // Still on the form, with the reason shown, rather than saved.
    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
    await expect(page.locator('#meal-serves').locator('xpath=../..')).toContainText(/between 1 and 99/i);
  });
});
