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

  // 4-5. The sheet, driven by a real touch drag rather than by setting
  // scrollTop, so what's recorded is what a finger gets: the drag starts
  // on the photo, a release past half-way snaps open, a release short of
  // it snaps back. Needs a recipe long enough for the header to collapse.
  const LONG = [...MEALS];
  LONG[0] = {
    ...MEALS[0],
    // A second photo sits at the end of the recipe, and gives it the
    // length to scroll.
    photos: [beet, cacio],
    method: [
      'Roast half the beets in salt until a knife slides through.',
      'Slice the rest paper thin and dress them while they are still raw.',
      'Grate the horseradish over at the last moment, so it keeps its heat.',
      'Split the dill oil with a little of the beet juice and spoon it round.',
      'Season with flaky salt and serve before the slices start to weep.',
    ],
    note: 'Wear gloves for the beets, or accept the colour.',
  };
  // Raw touch points: Input.synthesizeScrollGesture looks like the obvious
  // tool, but headless Chromium ignores it and nothing scrolls. `distance`
  // is how far the sheet is pulled up; negative pulls it back down.
  // `from` is where the finger goes down, as a fraction of the height.
  const drag = async (page, distance, from, ms = 600) => {
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('.dish').boundingBox();
    const x = box.x + box.width / 2;
    const y0 = box.y + box.height * from;
    const steps = Math.max(8, Math.round(ms / 16));
    const at = (i) => [{ x, y: y0 - (distance * i) / steps, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const sheetScene = async (page) => {
    await page.locator('.meal-card').first().click();
    await page.waitForTimeout(1000);
    const S = await page.evaluate(() => document.querySelector('.dish-sheet').offsetTop);
    await drag(page, S * 0.3, 0.4); // from the photo, short of half-way: settles back
    await page.waitForTimeout(900);
    await drag(page, S * 0.62, 0.4); // past it: settles open
    await page.waitForTimeout(1100);
    await drag(page, 420, 0.8); // on into the recipe: the header collapses
    await page.waitForTimeout(1100);
    await drag(page, -700, 0.12, 700); // all the way back down
    await page.waitForTimeout(900);
  };
  // 6. Swiping between dishes: a short drag that settles back, then one
  // past a third of the way that moves on, then the same back again.
  const swipe = async (page, dx, ms = 350) => {
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('.dish-photo').boundingBox();
    const y = box.y + box.height / 2;
    const x0 = box.x + box.width / 2;
    const steps = Math.max(8, Math.round(ms / 16));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y, id: 1 }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y, id: 1 }] });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(120);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const swipeScene = async (page) => {
    await page.locator('.meal-card').nth(1).click();
    await page.waitForTimeout(1000);
    await swipe(page, -80); // short: settles back
    await page.waitForTimeout(900);
    await swipe(page, -170); // past a third: the newer dish
    await page.waitForTimeout(1300);
    await swipe(page, 170); // and back
    await page.waitForTimeout(1300);
  };
  await scene(browser, '6-swipe', MEALS, swipeScene, { hasTouch: true, isMobile: true });

  await scene(browser, '4-sheet', LONG, sheetScene, { hasTouch: true, isMobile: true });
  await scene(browser, '5-sheet-reduced', LONG, sheetScene, { hasTouch: true, isMobile: true, reducedMotion: 'reduce' });

  // Stills worth having alongside the video.
  const context = await browser.newContext({ viewport: { width: 420, height: 880 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await seed(page, LONG);
  await page.goto(BASE);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(OUT, 'still-gallery.png') });
  await page.locator('.meal-card').first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'still-dish.png') });
  // The sheet's other two rests.
  const sheetTo = (top) =>
    page.evaluate(async (t) => {
      document.querySelector('.dish-scroller').scrollTo({ top: t, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 300));
    }, top);
  const S = await page.evaluate(() => document.querySelector('.dish-sheet').offsetTop);
  await sheetTo(S);
  await page.screenshot({ path: path.join(OUT, 'still-sheet-open.png') });
  // The recipe's extra photo loads lazily, and until it has, the recipe
  // is too short to scroll far enough to collapse the header.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.dish-more-photo')].every((img) => img.complete && img.naturalHeight > 0)
  );
  await sheetTo(S + 400);
  await page.screenshot({ path: path.join(OUT, 'still-sheet-collapsed.png') });
  await sheetTo(0);
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
