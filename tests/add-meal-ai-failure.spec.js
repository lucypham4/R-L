import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Regression suite for the add-meal wizard when the ai-fill Edge Function
// fails.
//
// A chef writing their dish once hit "Edge Function returned a non-2xx
// status code" on step 2 and could go no further. Three separate defects
// were behind it, and each one is pinned here:
//
//   1. supabase-js reports every non-2xx as that same generic string; the
//      Edge Function's real message lives in the response body, reachable
//      only through error.context. The client was discarding it.
//   2. A failed AI fill left the chef on step 2, so an optional enrichment
//      gated saving a meal at all.
//   3. SketchCanvas only renders on step 1, so sketchRef.current is null
//      from step 2 onward -- yet the AI call and the save both read it.
//
// AI fill is an enrichment. The invariant these tests defend is that its
// failure, for any reason, never costs the chef their work or their way
// forward.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

/**
 * Boots the app as a guest with the wizard open, routing every Supabase
 * call. `onAiFill` decides how the Edge Function behaves for this test.
 */
async function openWizard(page, onAiFill) {
  await page.route('**stub.supabase.co/**', (route) => {
    const url = route.request().url();
    if (url.includes('/functions/v1/ai-fill')) return onAiFill(route);
    // Auth and data: answer empty so the app settles as a guest.
    if (url.includes('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(() => localStorage.setItem('onboarding-seen-local', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.add-meal-card')).toBeVisible();
}

/** Step 1 via the photo path, which runs through the crop modal. */
async function attachPhotoAndContinue(page) {
  await page.setInputFiles('#photo', DISH_PHOTO);
  await expect(page.locator('.photo-crop-card')).toBeVisible();
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.locator('.photo-crop-card')).toBeHidden();
  await page.locator('.add-meal-next').click();
  await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 2 OF 3/i);
}

test.describe('add-meal wizard, ai-fill failure', () => {
  test('surfaces the Edge Function\'s own message and still moves on', async ({ page }) => {
    await openWizard(page, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'GEMINI_API_KEY is not configured on this project.' }),
      }),
    );
    await attachPhotoAndContinue(page);

    const notes = 'Chicken thigh sous vide then torched, bok choy with garlic and mirin.';
    await page.locator('textarea').first().fill(notes);
    await page.locator('.add-meal-next').click();

    // Not a dead end: the chef lands on the card they came to write.
    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);

    const notice = page.locator('.add-meal-notice');
    await expect(notice).toBeVisible();
    // The actionable part, which used to be swallowed by supabase-js.
    await expect(notice).toContainText('GEMINI_API_KEY is not configured on this project.');
    await expect(notice).not.toContainText(/non-2xx/i);

    // Their words survive the failure rather than being thrown away.
    await expect(page.locator('#meal-description')).toHaveValue(notes);
  });

  test('falls back to plain wording when the failure has no message of ours', async ({ page }) => {
    // A platform-level 404 (function never deployed) never reaches our
    // handler, so there is no JSON body to read.
    await openWizard(page, (route) =>
      route.fulfill({ status: 404, contentType: 'text/html', body: '<html>not found</html>' }),
    );
    await attachPhotoAndContinue(page);

    await page.locator('textarea').first().fill('Some notes about the dish.');
    await page.locator('.add-meal-next').click();

    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
    const notice = page.locator('.add-meal-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/couldn[’']t reach the ai/i);
    // Never show supabase-js's status-code string to a chef.
    await expect(notice).not.toContainText(/non-2xx/i);
  });

  test('sketch mode survives leaving step 1', async ({ page }) => {
    // sketchRef.current is null from step 2 onward. Reading it there threw
    // "Cannot read properties of null (reading 'getBlob')", which broke both
    // advancing and saving for every sketched meal.
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await openWizard(page, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
    );

    await page.getByRole('tab', { name: 'Sketch' }).click();
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 12 });
    await page.mouse.up();

    await page.locator('.add-meal-next').click();
    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 2 OF 3/i);
    await page.locator('textarea').first().fill('A sketched dish.');
    await page.locator('.add-meal-next').click();

    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
    await expect(page.locator('.add-meal-notice')).not.toContainText(/getBlob/);
    expect(pageErrors.join(' | ')).not.toMatch(/getBlob/);
  });
});
