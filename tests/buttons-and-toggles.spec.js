import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// Buttons say what they are by their colour, and the toggles move.
//
//   - Red is for one button: the one that finishes adding a meal. Every
//     other primary is ink, a Cancel or a Back is a gray outline.
//   - A button reads in sentence case, in the system face.
//   - A segmented toggle (photo or sketch, 1:1 or 4:5) and the nav slide
//     their pill to the chosen option instead of snapping.
//
// shape.md has the rules, motion.md the toggles. This checks them against
// what ships, in computed style rather than a reading of the CSS.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

const AI_FILL = {
  name: 'Charred leek, hazelnut',
  date: '',
  description: 'Leeks charred over coals and finished with brown butter.',
  summary: 'Charred leeks under brown butter.',
  cuisine: 'French',
  category: 'Starter',
  ingredients: ['leek', 'brown butter'],
  method: ['Char the leeks.'],
  note: '',
};

async function openWizard(page) {
  await page.route('**stub.supabase.co/**', (route) => {
    const url = route.request().url();
    if (url.includes('/functions/v1/ai-fill')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AI_FILL) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: url.includes('/auth/v1/') ? '{}' : '[]' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.add-meal-card')).toBeVisible();
}

async function toStep2(page) {
  await page.setInputFiles('#photo', DISH_PHOTO);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.locator('.photo-crop-card')).toBeHidden();
  await page.locator('.add-meal-next').click();
  await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 2 OF 3/i);
}

async function toStep3(page) {
  await toStep2(page);
  await page.locator('textarea').first().fill('Leeks on the coals, brown butter, hazelnuts.');
  await page.locator('.add-meal-next').click();
  await expect(page.locator('.add-meal-progress')).toHaveText(/STEP 3 OF 3/i);
  await expect(page.locator('#meal-name')).toHaveValue(AI_FILL.name);
}

/** A token as the browser resolves it, so it compares with computed style. */
function resolve(page, token) {
  return page.evaluate((t) => {
    const probe = document.createElement('i');
    probe.style.color = `var(${t})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

/** Lets the transitions that are running finish, so a colour is read settled. */
const settle = (page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );

const look = (locator) =>
  locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderTopColor, borderWidth: cs.borderTopWidth, color: cs.color };
  });

test.describe('buttons', () => {
  test('Cancel is a gray outline, Next is ink, and Save meal is the only red', async ({ page }) => {
    await openWizard(page);
    const ink = await resolve(page, '--color-ink');
    const accent = await resolve(page, '--color-accent');
    const grayLine = await resolve(page, '--color-line-strong');

    const cancel = page.locator('.add-meal-footer').getByRole('button', { name: 'Cancel' });
    expect(await look(cancel)).toMatchObject({ bg: 'rgba(0, 0, 0, 0)', border: grayLine, borderWidth: '1px' });
    expect(await look(page.locator('.add-meal-next'))).toMatchObject({ bg: ink, border: ink });

    await toStep2(page);
    // The pointer is still over where Next was, so it is mid-way into its
    // hover colour; take it away and let that finish before reading.
    await page.mouse.move(0, 0);
    await settle(page);
    expect(await look(page.getByRole('button', { name: 'Back' }))).toMatchObject({ bg: 'rgba(0, 0, 0, 0)', border: grayLine });
    expect(await look(page.locator('.add-meal-next'))).toMatchObject({ bg: ink });

    await page.locator('textarea').first().fill('Leeks on the coals, brown butter, hazelnuts.');
    await page.locator('.add-meal-next').click();
    await expect(page.locator('#meal-name')).toHaveValue(AI_FILL.name);
    // Save meal fades up from its disabled grey once the answer lands.
    await expect(page.getByRole('button', { name: 'Save meal' })).toBeEnabled();
    await page.mouse.move(0, 0);
    await settle(page);

    expect(await look(page.getByRole('button', { name: 'Save meal' }))).toMatchObject({ bg: accent, border: accent });
    expect(await look(page.getByRole('button', { name: 'Back' }))).toMatchObject({ bg: 'rgba(0, 0, 0, 0)', border: grayLine });

    // Across everything on the page, nav and crop controls included: the
    // one button drawn in red is the one that finishes the meal.
    const red = await page.evaluate((accentColor) => {
      return [...document.querySelectorAll('button')]
        .filter((b) => {
          const cs = getComputedStyle(b);
          return [cs.backgroundColor, cs.borderTopColor, cs.color].includes(accentColor);
        })
        .map((b) => b.textContent.trim() || b.getAttribute('aria-label'));
    }, accent);
    expect(red).toEqual(['Save meal']);
  });

  test('a button reads in sentence case, in the system face', async ({ page }) => {
    await openWizard(page);
    const faces = await page.evaluate(() =>
      [...document.querySelectorAll('.add-meal-card .btn')].map((b) => {
        const cs = getComputedStyle(b);
        return { text: b.innerText.trim(), transform: cs.textTransform, family: cs.fontFamily, tracking: cs.letterSpacing };
      }),
    );
    expect(faces.map((f) => f.text)).toEqual(['Cancel', 'Next']);
    for (const face of faces) {
      expect(face.transform).toBe('none');
      expect(face.tracking).toBe('normal');
      // SF on iOS and Mac, then Inter for everything else.
      expect(face.family).toMatch(/^-apple-system, BlinkMacSystemFont, Inter/);
    }
  });
});

test.describe('the bottom nav', () => {
  test('the active tab is a filled ink pill that slides to the other one', async ({ page }) => {
    await openWizard(page);
    // Opening the wizard moved the active tab to Add; go back to see it move.
    await page.keyboard.press('Escape');
    await expect(page.locator('.add-meal-card')).toBeHidden();
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

    const ink = await resolve(page, '--color-ink');
    const bg = await resolve(page, '--color-bg');
    const pill = () =>
      page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.bottom-nav'), '::before');
        return { fill: cs.backgroundColor, x: new DOMMatrix(cs.transform).m41, width: parseFloat(cs.width) };
      });

    const home = await pill();
    expect(home.fill).toBe(ink);
    expect(home.x).toBeCloseTo(0, 0);
    expect(await page.getByRole('button', { name: 'Home' }).evaluate((el) => getComputedStyle(el).color)).toBe(bg);

    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const moving = await page.evaluate(() =>
      document
        .querySelector('.bottom-nav')
        .getAnimations({ subtree: true })
        .filter((a) => a.transitionProperty === 'transform' && a.effect.pseudoElement === '::before')
        .map((a) => a.effect.getTiming().duration),
    );
    expect(moving.length).toBe(1);
    expect(moving[0]).toBeGreaterThan(0);
    expect(moving[0]).toBeLessThan(400);

    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    const add = await pill();
    // One pill's width and the 4px between the tabs.
    expect(add.x).toBeCloseTo(add.width + 4, 0);
    expect(await page.getByRole('button', { name: 'Add', exact: true }).evaluate((el) => getComputedStyle(el).color)).toBe(bg);
  });
});

test.describe('segmented toggles', () => {
  const pillAt = (toggle) =>
    toggle.evaluate((el) => {
      const cs = getComputedStyle(el, '::before');
      return { x: new DOMMatrix(cs.transform).m41, width: parseFloat(cs.width), fill: cs.backgroundColor };
    });

  const sliding = (toggle) =>
    toggle.evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.transitionProperty === 'transform' && a.effect.pseudoElement === '::before')
        .map((a) => a.effect.getTiming().duration),
    );

  test('Photo / Sketch: the pill slides across, quickly', async ({ page }) => {
    await openWizard(page);
    const toggle = page.getByRole('tablist', { name: 'Photo source' });
    const ink = await resolve(page, '--color-ink');

    const start = await pillAt(toggle);
    expect(start.x).toBeCloseTo(0, 0);
    expect(start.fill).toBe(ink);

    await page.getByRole('tab', { name: 'Sketch' }).click();
    const durations = await sliding(toggle);
    expect(durations.length).toBe(1);
    expect(durations[0]).toBeGreaterThan(0);
    expect(durations[0]).toBeLessThanOrEqual(300);

    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    const end = await pillAt(toggle);
    expect(end.x).toBeCloseTo(end.width + 2, 0);
    await expect(page.getByRole('tab', { name: 'Sketch' })).toHaveAttribute('aria-selected', 'true');
  });

  test('1:1 / 4:5 in the crop modal slides the same way', async ({ page }) => {
    await openWizard(page);
    await page.setInputFiles('#photo', DISH_PHOTO);
    const toggle = page.getByRole('tablist', { name: 'Crop aspect ratio' });
    await expect(toggle).toBeVisible();
    await page.getByRole('tab', { name: '4:5' }).click();
    const durations = await sliding(toggle);
    expect(durations).toEqual([240]);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    const end = await pillAt(toggle);
    expect(end.x).toBeCloseTo(end.width + 2, 0);
  });

  test('with reduced motion the pill jumps and the labels still change', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWizard(page);
    const toggle = page.getByRole('tablist', { name: 'Photo source' });
    await page.getByRole('tab', { name: 'Sketch' }).click();
    expect(await sliding(toggle)).toEqual([]);
    const end = await pillAt(toggle);
    expect(end.x).toBeCloseTo(end.width + 2, 0);
    await expect(page.getByRole('tab', { name: 'Sketch' })).toHaveAttribute('aria-selected', 'true');
  });
});

test('the wizard reaches its last step with the buttons in place', async ({ page }) => {
  await openWizard(page);
  await toStep3(page);
  await expect(page.getByRole('button', { name: 'Save meal' })).toBeEnabled();
});
