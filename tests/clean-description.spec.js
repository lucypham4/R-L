import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// "Clean up" (the clean-description function) tries again when the model is
// busy, as the AI fill does: up to three tries, the pause growing, and only
// for a 503 or 429. The server side of the same story is
// tests/gemini-functions.spec.js; the fill's own is add-meal-ai-failure.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));
const NOTES = 'um so I like charred the leeks you know over coals';
const CLEANED = 'I charred the leeks over coals.';

const busy = (status = 503) => ({
  status: 502,
  body: { error: `AI request failed (${status}): { "error": { "code": ${status}, "message": "This model is currently experiencing high demand.", "status": "UNAVAILABLE" } }` },
});

/**
 * Opens the add-meal card on step 3 with `NOTES` in the description (the fill
 * fails fast, so the notes carry over), and answers clean-description from
 * `answers`, one entry per call. Returns the times of its calls.
 */
async function reachCleanUp(page, answers) {
  const calls = [];
  await page.route('**stub.supabase.co/**', (route) => {
    const url = route.request().url();
    const reply = ({ status = 200, body }) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/functions/v1/ai-fill')) return reply({ status: 500, body: { error: 'Not deployed.' } });
    if (url.includes('/functions/v1/clean-description')) {
      calls.push(Date.now());
      return reply(answers[Math.min(calls.length, answers.length) - 1]);
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: url.includes('/auth/v1/') ? '{}' : '[]' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.setInputFiles('#photo', DISH_PHOTO);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.locator('.photo-crop-card')).toBeHidden();
  await page.locator('.add-meal-next').click();
  await page.locator('textarea').first().fill(NOTES);
  await page.locator('.add-meal-next').click();
  await expect(page.locator('.add-meal-progress')).toHaveText(/Step 3 of 3/);
  await expect(page.locator('#meal-description')).toHaveValue(NOTES);
  return calls;
}

test.describe('Clean up, when the model is busy', () => {
  test('tries again, the pause growing, and the cleaned description lands', async ({ page }) => {
    const calls = await reachCleanUp(page, [busy(503), busy(429), { body: { description: CLEANED } }]);
    await page.getByRole('button', { name: 'Clean up' }).click();

    await expect(page.locator('#meal-description')).toHaveValue(CLEANED, { timeout: 10_000 });
    expect(calls).toHaveLength(3);
    // 1.5s before the second try, 3s before the third.
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(1400);
    expect(calls[2] - calls[1]).toBeGreaterThanOrEqual(2900);
    await expect(page.locator('.field-error')).toHaveCount(0);
  });

  test('gives up after the third try, and the description is left as it was', async ({ page }) => {
    const calls = await reachCleanUp(page, [busy()]);
    await page.getByRole('button', { name: 'Clean up' }).click();

    await expect(page.locator('.field-error')).toContainText('AI request failed (503)', { timeout: 10_000 });
    expect(calls).toHaveLength(3);
    await expect(page.locator('#meal-description')).toHaveValue(NOTES);
    // Free to try again.
    await expect(page.getByRole('button', { name: 'Clean up' })).toBeEnabled();
  });

  test('does not retry any other failure', async ({ page }) => {
    const calls = await reachCleanUp(page, [{ status: 502, body: { error: 'AI request failed (404): model not found' } }]);
    await page.getByRole('button', { name: 'Clean up' }).click();

    await expect(page.locator('.field-error')).toContainText('AI request failed (404)');
    await page.waitForTimeout(1800);
    expect(calls).toHaveLength(1);
  });
});
