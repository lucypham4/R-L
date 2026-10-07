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

// Clean up's own Details, next to its line. (The AI-fill notice above it, which
// these tests leave showing because the fill fails, has one of its own.)
const cleanUpDetails = (page) => page.locator('.field-error + .add-meal-notice-details');

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

  test('gives up after the third try with a plain line, the raw reply only behind Details', async ({ page }) => {
    const calls = await reachCleanUp(page, [busy()]);
    await page.getByRole('button', { name: 'Clean up' }).click();

    const line = page.locator('.field-error');
    await expect(line).toHaveText('The AI couldn’t clean this up. Still busy. Try again in a minute.', { timeout: 10_000 });
    expect(calls).toHaveLength(3);
    await expect(page.locator('#meal-description')).toHaveValue(NOTES);
    // Free to try again.
    await expect(page.getByRole('button', { name: 'Clean up' })).toBeEnabled();

    // No Gemini JSON in the line, or anywhere the chef can see it: it is
    // under Details, which starts closed.
    expect(await line.innerText()).not.toMatch(/AI request failed|UNAVAILABLE|[{}]/);
    const details = cleanUpDetails(page);
    const reason = details.locator('.add-meal-notice-reason');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(reason).toBeHidden();
    await details.locator('summary').click();
    await expect(reason).toContainText('AI request failed (503)');
    await expect(reason).toContainText('UNAVAILABLE');
  });

  test('does not retry any other failure, and says the description is unchanged', async ({ page }) => {
    const calls = await reachCleanUp(page, [{ status: 502, body: { error: 'AI request failed (404): model not found' } }]);
    await page.getByRole('button', { name: 'Clean up' }).click();

    await expect(page.locator('.field-error')).toHaveText('The AI couldn’t clean this up. Your description is unchanged.');
    const reason = cleanUpDetails(page).locator('.add-meal-notice-reason');
    await expect(reason).toBeHidden();
    await cleanUpDetails(page).locator('summary').click();
    await expect(reason).toHaveText('AI request failed (404): model not found');
    await page.waitForTimeout(1800);
    expect(calls).toHaveLength(1);
    await expect(page.locator('#meal-description')).toHaveValue(NOTES);
  });

  test('the notice goes when Clean up is pressed again and works', async ({ page }) => {
    await reachCleanUp(page, [
      { status: 502, body: { error: 'AI request failed (404): model not found' } },
      { body: { description: CLEANED } },
    ]);
    await page.getByRole('button', { name: 'Clean up' }).click();
    await expect(page.locator('.field-error')).toBeVisible();
    await page.getByRole('button', { name: 'Clean up' }).click();
    await expect(page.locator('#meal-description')).toHaveValue(CLEANED);
    await expect(page.locator('.field-error')).toHaveCount(0);
    await expect(cleanUpDetails(page)).toHaveCount(0);
  });
});
