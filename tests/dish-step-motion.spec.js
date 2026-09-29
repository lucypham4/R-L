import { test, expect } from './support/network';

// The dish-to-dish transition in the detail modal, pinned.
//
// Two effects run together when you step from one dish to the next:
//
//   1. The name cross-dissolves in place -- outgoing and incoming overlap
//      for the whole duration, so both are legible half-way through.
//   2. Everything below it focus-pulls -- it arrives soft, holds while the
//      name resolves, then comes into focus.
//
// Both are easy to break into a no-op without anyone noticing: a stray
// `forwards`, a remount that never happens, a token renamed. Motion that
// silently stops moving still passes a screenshot diff, so it's asserted
// numerically here instead.

const MEALS = [
  {
    id: 'm1',
    name: 'Charred leek, hazelnut',
    cuisine: 'French',
    category: 'Starter',
    date: '2026-09-20',
    serves: 2,
    photos: [],
    ingredients: ['leek'],
    method: ['Char the leeks.'],
    description: 'A plate built on smoke.',
    note: '',
  },
  {
    id: 'm2',
    name: 'Cacio e pepe',
    cuisine: 'Italian',
    category: 'Main',
    date: '2026-09-10',
    serves: 2,
    photos: [],
    ingredients: ['pecorino'],
    method: ['Emulsify.'],
    description: 'Three ingredients, no hiding.',
    note: '',
  },
];

// The name is rendered twice -- large over the resting sheet and small in
// the header -- and both dissolve together. The large one is the heading,
// and the one on screen when the dish first opens.
const NAME_IN = '.dish-hero-title .dish-name-in';
const NAME_OUT = '.dish-hero-title .dish-name-out';

async function openNewestDish(page) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript((meals) => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
  }, MEALS);
  await page.goto('/');
  await page.locator('.meal-card').first().click();
  await expect(page.locator('.dish')).toBeVisible();
}

/** Samples the transition every ~35ms for a second. */
async function sampleTransition(page) {
  const samples = [];
  for (let i = 0; i < 28; i++) {
    samples.push(
      await page.evaluate(() => {
        const body = document.querySelector('.dish-body-inner');
        const out = document.querySelector('.dish-hero-title .dish-name-out');
        const inn = document.querySelector('.dish-hero-title .dish-name-in');
        return {
          blur: body ? getComputedStyle(body).filter : 'none',
          out: out ? Number(getComputedStyle(out).opacity) : null,
          in: inn ? Number(getComputedStyle(inn).opacity) : null,
        };
      })
    );
    await page.waitForTimeout(35);
  }
  return samples;
}

function isBlurred(filter) {
  return filter !== 'none' && filter !== '' && !/blur\(0(\.0+)?(px)?\)/.test(filter);
}

test.describe('stepping between dishes', () => {
  test('cross-dissolves the name and focus-pulls the body', async ({ page }) => {
    await openNewestDish(page);
    await expect(page.locator(NAME_IN)).toHaveText('Charred leek, hazelnut');

    await page.getByRole('button', { name: 'Previous dish' }).click();
    const samples = await sampleTransition(page);

    // Both titles legible at once -- the defining property of a
    // cross-dissolve, as opposed to fading one out then the other in.
    expect(samples.some((s) => s.out !== null && s.out > 0.3 && s.in > 0.3)).toBe(true);

    // The body arrives out of focus and ends sharp.
    expect(isBlurred(samples[0].blur)).toBe(true);
    expect(isBlurred(samples.at(-1).blur)).toBe(false);

    // The name resolves to the dish that was actually stepped to.
    await expect(page.locator(NAME_IN)).toHaveText('Cacio e pepe');
    await expect(page.locator(NAME_OUT)).toHaveCount(0);
  });

  test('arrows stop at the ends of the archive', async ({ page }) => {
    await openNewestDish(page);
    // Opened on the newest dish, which is the archive's highest number.
    await expect(page.getByRole('button', { name: 'Next dish' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Previous dish' })).toBeEnabled();

    await page.getByRole('button', { name: 'Previous dish' }).click();
    await expect(page.locator(NAME_IN)).toHaveText('Cacio e pepe');
    await expect(page.getByRole('button', { name: 'Previous dish' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next dish' })).toBeEnabled();
  });

  // Note: page.emulateMedia, not test.use({ reducedMotion }). The latter
  // silently fails to reach the page under this config's device project --
  // matchMedia still reports false, so the test passes against full-motion
  // CSS and proves nothing.
  test('reduced motion keeps the softening and drops the dwell', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openNewestDish(page);

    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const read = (k) => cs.getPropertyValue(k).trim();
      return {
        dissolve: read('--dur-dissolve'),
        refocus: read('--dur-refocus'),
        colour: read('--dur-color'),
        dofScale: read('--dof-scale'),
        blur: read('--blur-defocus'),
      };
    });

    // The dwell collapses to a plain colour-length fade...
    expect(tokens.dissolve).toBe(tokens.colour);
    expect(tokens.refocus).toBe(tokens.colour);
    // ...the scale goes entirely...
    expect(Number(tokens.dofScale)).toBe(1);
    // ...but the softening stays. Blur carries no vestibular risk, and
    // without it a dish swap becomes an unexplained cut.
    expect(parseFloat(tokens.blur)).toBeGreaterThan(0);

    // And the transition still completes, faster.
    await page.getByRole('button', { name: 'Previous dish' }).click();
    await expect(page.locator(NAME_IN)).toHaveText('Cacio e pepe');
    await expect(page.locator(NAME_OUT)).toHaveCount(0);
  });

  test('the gallery recedes behind an open dish', async ({ page }) => {
    await openNewestDish(page);
    await expect(page.locator('.app-stage')).toHaveClass(/app-stage-receded/);
    // Settle past the transition before reading the resting value.
    await page.waitForTimeout(400);
    const filter = await page.locator('.app-stage').evaluate((el) => getComputedStyle(el).filter);
    expect(isBlurred(filter)).toBe(true);

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.app-stage')).not.toHaveClass(/app-stage-receded/);
  });
});
