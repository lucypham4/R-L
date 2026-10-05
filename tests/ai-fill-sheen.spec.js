import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// While the AI fills in a dish's details, the fields it writes shimmer with
// the Staj sheen (the glint that crosses the wordmark on the first frame),
// and each one stops as its content arrives.
//
// That meant moving the chef to the card at once: step 2's Next used to
// hold them there, "Filling in…", until the answer was in, so there was
// nothing on screen to shimmer. These tests gate the Edge Function so the
// moment in between can be looked at.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));
const NOTES = 'Leeks on the coals, brown butter, hazelnuts.';

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

// The nine fields the AI writes; serves is not one of them.
const FIELDS = 9;

/** A promise the test settles by hand, for holding the Edge Function open. */
function gate() {
  let open;
  const opened = new Promise((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/**
 * Boots as a guest with the wizard open. `onAiFill(route, callNumber)`
 * decides when and how each ai-fill call is answered.
 */
async function openWizard(page, onAiFill) {
  let calls = 0;
  await page.route('**stub.supabase.co/**', (route) => {
    const url = route.request().url();
    if (url.includes('/functions/v1/ai-fill')) return onAiFill(route, ++calls);
    return route.fulfill({ status: 200, contentType: 'application/json', body: url.includes('/auth/v1/') ? '{}' : '[]' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.add-meal-card')).toBeVisible();
  await page.setInputFiles('#photo', DISH_PHOTO);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.locator('.photo-crop-card')).toBeHidden();
  await page.locator('.add-meal-next').click();
  await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 2 OF 3/i);
  await page.locator('textarea').first().fill(NOTES);
}

const answer = (body, status = 200) => (route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const nextToCard = async (page) => {
  await page.locator('.add-meal-next').click();
  await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
};

/** Passes of the sheen running anywhere on the page right now. */
const passes = (page) =>
  page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'sheen-pass').length);

/**
 * What the card must look like once the AI has given up, whatever the
 * reason: no skeletons, nothing locked, the chef's own words where the
 * description goes and every other AI field empty and theirs to fill, and
 * Save back. The failure notice itself is the caller's to assert.
 */
async function expectCardIsTheChefs(page) {
  await expect(page.locator('.sheen-fill-active')).toHaveCount(0);
  await expect(page.locator('.sheen-fill[inert]')).toHaveCount(0);
  expect(await passes(page)).toBe(0);
  await expect(page.locator('#meal-description')).toHaveValue(NOTES);
  for (const id of ['#meal-name', '#meal-summary', '#meal-date', '#meal-method', '.add-meal-note-input']) {
    await expect(page.locator(id)).toHaveValue('');
    await expect(page.locator(id)).toBeEditable();
  }
  // Editable for real: a name typed now sticks, and the card can be saved.
  await page.locator('#meal-name').fill('Mine');
  await expect(page.locator('#meal-name')).toHaveValue('Mine');
  await expect(page.getByRole('button', { name: 'Save meal' })).toBeEnabled();
  await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
}

test.describe('while the AI fills in the card', () => {
  test('the fields it writes shimmer, hold still, and let go as the answer lands', async ({ page }) => {
    const held = gate();
    await openWizard(page, async (route) => {
      await held.opened;
      return answer(AI_FILL)(route);
    });
    await nextToCard(page);

    const waiting = page.locator('.sheen-fill-active');
    await expect(waiting).toHaveCount(FIELDS);
    // The Staj sheen itself, looping, on each of them.
    expect(await passes(page)).toBe(FIELDS);
    const looping = await waiting.first().evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.animationName === 'sheen-pass')
        .map((a) => ({ iterations: a.effect.getTiming().iterations, pseudo: a.effect.pseudoElement })),
    );
    expect(looping).toEqual([{ iterations: Infinity, pseudo: '::after' }]);

    // Waiting fields take no input (the answer would overwrite it), the
    // card can't be saved yet, and a screen reader is told why.
    await expect(waiting.first()).toHaveAttribute('inert', '');
    await expect(waiting.first()).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: 'Save meal' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: 'Filling in the details' })).toHaveCount(1);
    // Serves isn't the AI's, so it is the chef's from the first moment.
    await expect(page.locator('#meal-serves')).toBeEditable();

    held.open();

    await expect(waiting).toHaveCount(0);
    expect(await passes(page)).toBe(0);
    await expect(page.locator('#meal-name')).toHaveValue(AI_FILL.name);
    await expect(page.locator('#meal-description')).toHaveValue(AI_FILL.description);
    await expect(page.locator('#meal-date')).toHaveValue(AI_FILL.date);
    await expect(page.getByRole('button', { name: 'Save meal' })).toBeEnabled();
    await expect(page.locator('.sheen-fill[inert]')).toHaveCount(0);
  });

  test('a field the AI left blank stops too: its answer arrived, empty', async ({ page }) => {
    await openWizard(page, answer({ ...AI_FILL, date: '', note: '' }));
    await nextToCard(page);
    await expect(page.locator('#meal-name')).toHaveValue(AI_FILL.name);
    await expect(page.locator('.sheen-fill-active')).toHaveCount(0);
    await expect(page.locator('#meal-date')).toHaveValue('');
  });

  test('with reduced motion the skeleton stays and the streak does not run', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const held = gate();
    await openWizard(page, async (route) => {
      await held.opened;
      return answer(AI_FILL)(route);
    });
    await nextToCard(page);

    const waiting = page.locator('.sheen-fill-active');
    await expect(waiting).toHaveCount(FIELDS);
    expect(await passes(page)).toBe(0);
    // Still readable as "not here yet": the skeleton is drawn over the field.
    const veil = await waiting.first().evaluate((el) => getComputedStyle(el, '::before').opacity);
    expect(veil).toBe('1');

    held.open();
    await expect(waiting).toHaveCount(0);
  });

  test('when the AI fails the shimmer stops and the notes carry over', async ({ page }) => {
    const held = gate();
    await openWizard(page, async (route) => {
      await held.opened;
      return answer({ error: 'GEMINI_API_KEY is not configured on this project.' }, 500)(route);
    });
    await nextToCard(page);
    await expect(page.locator('.sheen-fill-active')).toHaveCount(FIELDS);

    held.open();

    await expect(page.locator('.add-meal-notice')).toContainText('GEMINI_API_KEY is not configured');
    await expectCardIsTheChefs(page);
  });

  test('when the request never gets through, the shimmer stops and the card is the chef’s', async ({ page }) => {
    const held = gate();
    await openWizard(page, async (route) => {
      await held.opened;
      return route.abort('failed');
    });
    await nextToCard(page);
    await expect(page.locator('.sheen-fill-active')).toHaveCount(FIELDS);

    held.open();

    await expect(page.locator('.add-meal-notice')).toContainText(/couldn[’']t reach the ai/i);
    await expectCardIsTheChefs(page);
  });

  test('going Back drops the answer that was on its way', async ({ page }) => {
    const first = gate();
    const second = gate();
    await openWizard(page, async (route, call) => {
      if (call === 1) {
        await first.opened;
        return answer({ ...AI_FILL, name: 'From the first ask' })(route);
      }
      await second.opened;
      return answer({ ...AI_FILL, name: 'From the second ask' })(route);
    });
    await nextToCard(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 2 OF 3/i);
    await expect(page.locator('.sheen-fill-active')).toHaveCount(0);

    await nextToCard(page);
    second.open();
    await expect(page.locator('#meal-name')).toHaveValue('From the second ask');
    // The first answer lands late, on top of the second's card, and is ignored.
    first.open();
    await page.waitForTimeout(300);
    await expect(page.locator('#meal-name')).toHaveValue('From the second ask');
  });

  // aiFill.js gives the request AI_FILL_TIMEOUT_MS (30s). The test can't
  // import it (the module reads import.meta.env), so the clock is moved by
  // the same figure and a little over. Playwright's clock stands in for the
  // wait; nothing here sleeps.
  const TIMEOUT_MS = 30_000;

  test('an answer that never comes ends the wait: skeletons clear, card editable, Save back, notice shown', async ({ page }) => {
    await page.clock.install();
    const held = gate();
    await openWizard(page, async (route) => {
      await held.opened;
      return answer(AI_FILL)(route);
    });
    await nextToCard(page);
    await expect(page.locator('.sheen-fill-active')).toHaveCount(FIELDS);
    await expect(page.getByRole('button', { name: 'Save meal' })).toBeDisabled();

    // Still waiting a little before the limit: nothing has changed.
    await page.clock.fastForward(TIMEOUT_MS - 5_000);
    await expect(page.locator('.sheen-fill-active')).toHaveCount(FIELDS);

    await page.clock.fastForward(6_000);

    // The same notice as any other failure, with the reason in it.
    await expect(page.locator('.add-meal-notice')).toBeVisible();
    await expect(page.locator('.add-meal-notice')).toContainText('The AI couldn’t fill in the details');
    await expect(page.locator('.add-meal-notice-reason')).toHaveText('The AI took too long to answer.');
    await expectCardIsTheChefs(page);

    // The function waking up late changes nothing on a card the chef now has.
    held.open();
    await page.waitForTimeout(300);
    await expect(page.locator('#meal-name')).toHaveValue('Mine');
  });

  test('a slow answer that beats the limit still fills the card', async ({ page }) => {
    await page.clock.install();
    const held = gate();
    await openWizard(page, async (route) => {
      await held.opened;
      return answer(AI_FILL)(route);
    });
    await nextToCard(page);
    await page.clock.fastForward(TIMEOUT_MS - 5_000);
    await expect(page.locator('.sheen-fill-active')).toHaveCount(FIELDS);

    held.open();

    await expect(page.locator('#meal-name')).toHaveValue(AI_FILL.name);
    await expect(page.locator('.sheen-fill-active')).toHaveCount(0);
    await expect(page.locator('.add-meal-notice')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save meal' })).toBeEnabled();
  });
});
