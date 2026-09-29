// Records the app's motion as video, so a change to a transition can be
// reviewed by watching it rather than by reading a diff.
//
//   node scripts/capture-preview.mjs [outDir]
//
// Expects a built app already being served (npm run build && npm run
// preview -- --port 4173). Writes one webm per scene plus stills; convert
// to mp4/gif afterwards with ffmpeg.
import { chromium } from 'playwright';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173';
const OUT = path.resolve(process.argv[2] ?? 'preview-out');
const ASSETS = path.resolve('scripts/preview-assets');

async function dataUrl(name) {
  const buf = await readFile(path.join(ASSETS, `${name}.png`));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const dish = (id, name, cuisine, category, date, photo, description, ingredients, method) => ({
  id, name, cuisine, category, date, serves: 2, photos: [photo],
  description, ingredients, method, note: '',
});

async function seed(page, meals) {
  await page.route('**stub.supabase.co/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript((m) => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('meal-diary-local-meals', JSON.stringify(m));
  }, meals);
}

/** One recorded scene. `act` drives it; the video lands at OUT/<name>.webm. */
async function scene(browser, name, meals, act, contextOpts = {}) {
  const dir = path.join(OUT, `_raw-${name}`);
  const context = await browser.newContext({
    viewport: { width: 420, height: 880 },
    deviceScaleFactor: 2,
    recordVideo: { dir, size: { width: 420, height: 880 } },
    ...contextOpts,
  });
  const page = await context.newPage();
  await seed(page, meals);
  await page.goto(BASE);
  await page.waitForTimeout(700);
  await act(page);
  await page.waitForTimeout(500);
  const video = page.video();
  await context.close();
  const src = await video.path();
  const { rename } = await import('node:fs/promises');
  await rename(src, path.join(OUT, `${name}.webm`));
  await rm(dir, { recursive: true, force: true });
  console.log(`  ${name}.webm`);
}

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const [leek, cacio, beet] = await Promise.all(
    ['leek', 'cacio', 'beet'].map(dataUrl)
  );

  const MEALS = [
    dish('m3', 'Beetroot, horseradish', 'Nordic', 'Starter', '2026-09-24', beet,
      'Raw and roasted in the same mouthful.', ['beetroot', 'horseradish', 'dill oil'],
      ['Roast half the beets in salt.', 'Slice the rest paper thin.']),
    dish('m2', 'Cacio e pepe', 'Italian', 'Main', '2026-09-18', cacio,
      'Three ingredients, no hiding.', ['pecorino', 'black pepper', 'tonnarelli'],
      ['Toast the pepper until it smells of the pan.', 'Emulsify off the heat.']),
    dish('m1', 'Charred leek, hazelnut', 'French', 'Starter', '2026-09-11', leek,
      'A plate built on smoke.', ['leek', 'brown butter', 'hazelnut'],
      ['Char the leeks over coals until the outer layers blacken.', 'Peel back to the sweet centre.']),
  ];

  const browser = await chromium.launch();
  console.log(`capturing to ${OUT}`);

  // 1. Opening a dish: the gallery recedes behind it.
  await scene(browser, '1-open', MEALS, async (page) => {
    await page.waitForTimeout(600);
    await page.locator('.meal-card').first().click();
    await page.waitForTimeout(1400);
  });

  // 2. Stepping between dishes: the dissolve and the focus pull.
  await scene(browser, '2-step', MEALS, async (page) => {
    await page.locator('.meal-card').first().click();
    await page.waitForTimeout(1100);
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Previous dish' }).click();
      await page.waitForTimeout(1500);
    }
    await page.getByRole('button', { name: 'Next dish' }).click();
    await page.waitForTimeout(1400);
  });

  // 3. The same step with reduced motion, for comparison.
  await scene(browser, '3-step-reduced', MEALS, async (page) => {
    await page.locator('.meal-card').first().click();
    await page.waitForTimeout(900);
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Previous dish' }).click();
      await page.waitForTimeout(900);
    }
  }, { reducedMotion: 'reduce' });

  // Stills worth having alongside the video.
  const context = await browser.newContext({ viewport: { width: 420, height: 880 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await seed(page, MEALS);
  await page.goto(BASE);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(OUT, 'still-gallery.png') });
  await page.locator('.meal-card').first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'still-dish.png') });
  // Mid-dissolve: both titles up at once.
  await page.getByRole('button', { name: 'Previous dish' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'still-mid-dissolve.png') });
  console.log('  stills');
  await context.close();
  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
