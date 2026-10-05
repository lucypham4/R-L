import { test, expect } from './support/network';
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

/** What the Edge Function answers when Gemini itself fails: 502, with Gemini's status in the message. */
function upstreamFailure(route, status = 503) {
  return route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({
      error: `AI request failed (${status}): { "error": { "code": ${status}, "message": "This model is currently experiencing high demand." } }`,
    }),
  });
}

const AI_DETAILS = {
  name: 'Bok choy chicken',
  date: '2025-01-02',
  description: 'A torched sous vide chicken thigh over garlicky bok choy.',
  summary: 'Torched chicken over garlicky bok choy.',
  cuisine: 'Japanese',
  category: 'Entree',
  ingredients: ['chicken thigh', 'bok choy', 'garlic', 'mirin'],
  method: ['Sous vide the chicken.', 'Torch the skin.', 'Wilt the bok choy.'],
  note: 'Dry the skin well before torching.',
};

function aiSuccess(route, overrides = {}) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ...AI_DETAILS, ...overrides }),
  });
}

/** Writes the notes on step 2 and presses Next. */
async function submitNotes(page, notes) {
  await page.locator('textarea').first().fill(notes);
  await page.locator('.add-meal-next').click();
}

/** Opens the wizard and gets as far as step 3 with a failed fill, which a `onAiFill` handler decides. */
async function reachFailedStep3(page, onAiFill, notes = 'Chicken thigh sous vide then torched, bok choy.') {
  await openWizard(page, onAiFill);
  await attachPhotoAndContinue(page);
  await submitNotes(page, notes);
  await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
  await expect(page.locator('.add-meal-notice')).toBeVisible();
  return notes;
}

/** A promise a test can settle from outside, to hold a route open while it looks at the page. */
function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test.describe('add-meal wizard, ai-fill failure', () => {
  test('keeps the Edge Function\'s own message behind Details and in the console, and still moves on', async ({ page }) => {
    const logged = [];
    page.on('console', (msg) => msg.type() === 'error' && logged.push(msg.text()));

    const notes = 'Chicken thigh sous vide then torched, bok choy with garlic and mirin.';
    await reachFailedStep3(
      page,
      (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'GEMINI_API_KEY is not configured on this project.' }),
        }),
      notes,
    );

    const notice = page.locator('.add-meal-notice');
    await expect(notice.locator('.add-meal-notice-title')).toHaveText('The AI couldn’t fill this in');
    await expect(notice).not.toContainText(/filled this in yourself/i);

    // Out of sight until asked for. This used to be printed in the notice.
    const reason = notice.locator('.add-meal-notice-reason');
    await expect(reason).toBeHidden();
    await notice.getByText('Details', { exact: true }).click();
    // The actionable part, which used to be swallowed by supabase-js.
    await expect(reason).toBeVisible();
    await expect(reason).toContainText('GEMINI_API_KEY is not configured on this project.');
    await expect(notice).not.toContainText(/non-2xx/i);

    // ...and for whoever has the console open instead.
    expect(logged.join('\n')).toContain('GEMINI_API_KEY is not configured on this project.');

    // Their words survive the failure rather than being thrown away.
    await expect(page.locator('#meal-description')).toHaveValue(notes);
  });

  test('falls back to plain wording when the failure has no message of ours', async ({ page }) => {
    // A platform-level 404 (function never deployed) never reaches our
    // handler, so there is no JSON body to read.
    await reachFailedStep3(page, (route) =>
      route.fulfill({ status: 404, contentType: 'text/html', body: '<html>not found</html>' }),
    );

    const notice = page.locator('.add-meal-notice');
    await notice.getByText('Details', { exact: true }).click();
    await expect(notice.locator('.add-meal-notice-reason')).toContainText(/couldn[’']t reach the ai/i);
    // Never show supabase-js's status-code string to a chef.
    await expect(notice).not.toContainText(/non-2xx/i);
  });

  for (const status of [503, 429]) {
    test(`retries once, after a pause, when the model answers ${status}`, async ({ page }) => {
      let calls = 0;
      const startedAt = Date.now();
      let secondCallAt = 0;
      await openWizard(page, (route) => {
        calls += 1;
        if (calls === 1) return upstreamFailure(route, status);
        secondCallAt = Date.now();
        return aiSuccess(route);
      });
      await attachPhotoAndContinue(page);
      await submitNotes(page, 'Chicken thigh sous vide then torched.');

      // The retry worked, so the chef never sees a failure at all.
      await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
      await expect(page.locator('.add-meal-notice')).toHaveCount(0);
      await expect(page.locator('#meal-name')).toHaveValue(AI_DETAILS.name);
      expect(calls).toBe(2);
      expect(secondCallAt - startedAt).toBeGreaterThanOrEqual(1800);
    });
  }

  test('gives up after the one retry', async ({ page }) => {
    let calls = 0;
    await openWizard(page, (route) => {
      calls += 1;
      return upstreamFailure(route, 503);
    });
    await attachPhotoAndContinue(page);
    await submitNotes(page, 'Some notes about the dish.');

    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
    await expect(page.locator('.add-meal-notice')).toBeVisible();
    expect(calls).toBe(2);
  });

  test('does not retry any other failure', async ({ page }) => {
    let calls = 0;
    await openWizard(page, (route) => {
      calls += 1;
      return upstreamFailure(route, 404);
    });
    await attachPhotoAndContinue(page);
    await submitNotes(page, 'Some notes about the dish.');

    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
    await expect(page.locator('.add-meal-notice')).toBeVisible();
    // Give a wrongly-scheduled retry time to show itself.
    await page.waitForTimeout(2600);
    expect(calls).toBe(1);
  });

  test('"Try again" re-runs the fill, shows it working, and dismisses the notice on success', async ({ page }) => {
    const notes = 'Chicken thigh sous vide then torched, bok choy.';
    const gate = deferred();
    let calls = 0;
    const requests = [];
    await reachFailedStep3(
      page,
      async (route) => {
        calls += 1;
        requests.push(route.request().postDataJSON());
        // A 500 isn't retried, so the first call fails at once.
        if (calls === 1) {
          return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
        }
        await gate.promise;
        return aiSuccess(route);
      },
      notes,
    );

    const tryAgain = page.getByRole('button', { name: 'Try again' });
    await expect(tryAgain).toBeEnabled();
    await tryAgain.click();

    // Working: the button says so and can't be pressed twice.
    const working = page.getByRole('button', { name: 'Trying again…' });
    await expect(working).toBeVisible();
    await expect(working).toBeDisabled();
    await expect(page.locator('.add-meal-notice')).toBeVisible();

    gate.release();

    await expect(page.locator('.add-meal-notice')).toHaveCount(0);
    await expect(page.locator('#meal-name')).toHaveValue(AI_DETAILS.name);
    await expect(page.locator('#meal-description')).toHaveValue(AI_DETAILS.description);
    await expect(page.locator('#meal-date')).toHaveValue(AI_DETAILS.date);
    await expect(page.locator('#meal-method')).toHaveValue(AI_DETAILS.method.join('\n'));
    expect(calls).toBe(2);
    // The same notes and photo as the first attempt.
    expect(requests[1].notes).toBe(notes);
    expect(requests[1].image).toEqual(requests[0].image);
  });

  test('"Try again" leaves what the chef has written since the failure', async ({ page }) => {
    const gate = deferred();
    let calls = 0;
    await reachFailedStep3(page, async (route) => {
      calls += 1;
      if (calls === 1) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
      }
      await gate.promise;
      return aiSuccess(route);
    });

    // Edited by hand after the failure, before asking again...
    await page.locator('#meal-name').fill('Sunday chicken');
    await page.locator('#meal-description').fill('My own words about this dish.');

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Trying again…' })).toBeDisabled();

    // ...and while it was thinking.
    await page.locator('#meal-summary').fill('Mine, written mid-request.');
    gate.release();

    await expect(page.locator('.add-meal-notice')).toHaveCount(0);
    // Hand edits stay, whenever they were made.
    await expect(page.locator('#meal-name')).toHaveValue('Sunday chicken');
    await expect(page.locator('#meal-description')).toHaveValue('My own words about this dish.');
    await expect(page.locator('#meal-summary')).toHaveValue('Mine, written mid-request.');
    // Everything left alone takes the AI's answer.
    await expect(page.locator('#meal-date')).toHaveValue(AI_DETAILS.date);
    await expect(page.locator('#meal-method')).toHaveValue(AI_DETAILS.method.join('\n'));
    await expect(page.locator('#meal-note')).toHaveValue(AI_DETAILS.note);
  });

  test('"Try again" keeps the notice, and frees the button, when it fails again', async ({ page }) => {
    const logged = [];
    page.on('console', (msg) => msg.type() === 'error' && logged.push(msg.text()));

    let calls = 0;
    await reachFailedStep3(page, (route) => {
      calls += 1;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: calls === 1 ? 'first failure' : 'second failure' }),
      });
    });

    await page.getByRole('button', { name: 'Try again' }).click();

    const notice = page.locator('.add-meal-notice');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled();
    await expect(notice).toBeVisible();
    await expect(notice.locator('.add-meal-notice-reason')).toHaveText('second failure');
    expect(logged.join('\n')).toContain('second failure');
    expect(calls).toBe(2);
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
