// PROTOTYPE, not production. Records the same gestures in both variants of
// the ?variant= prototype (src/lib/variant.prototype.js) and puts them side
// by side, today on the left and the apple-design skill on the right, so the
// difference can be watched rather than read.
//
//   npm run build && npm run preview -- --port 4173
//   node scripts/capture-prototype-apple.mjs [outDir]
//
// Needs ffmpeg for the side-by-side mp4s; the raw webms are kept either way.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173';
const OUT = path.resolve(process.argv[2] ?? 'preview-out/apple');
const ASSETS = path.resolve('scripts/preview-assets');
const SIZE = { width: 390, height: 844 };

const dataUrl = async (name) => `data:image/png;base64,${(await readFile(path.join(ASSETS, `${name}.png`))).toString('base64')}`;

const dish = (id, name, cuisine, category, date, photo, description) => ({
  id, name, cuisine, category, date, serves: 2, photos: [photo], description,
  ingredients: ['salt', 'butter', 'lemon'], method: ['Season it.', 'Cook it.', 'Serve it.'], note: '',
});

/** A finger, timed by its own clock as the test suite's is. */
async function finger(page, selector, { at: where = 0.5 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator(selector).first().boundingBox();
  const at = { x: box.x + box.width / 2, y: box.y + box.height * where };
  let clock = Date.now() / 1000;
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points, timestamp: clock });
  return {
    press: () => send('touchStart', [{ ...at, id: 1 }]),
    async move(dx, dy, ms) {
      const x0 = at.x;
      const y0 = at.y;
      const steps = Math.max(3, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        at.x = x0 + (dx * i) / steps;
        at.y = y0 + (dy * i) / steps;
        clock += ms / steps / 1000;
        await send('touchMove', [{ ...at, id: 1 }]);
        await page.waitForTimeout(ms / steps);
      }
    },
    async lift(holdMs = 0) {
      clock += holdMs / 1000;
      if (holdMs) await page.waitForTimeout(holdMs);
      await send('touchEnd', []);
    },
  };
}

async function record(browser, name, variant, meals, act) {
  const dir = path.join(OUT, `_raw-${name}-${variant}`);
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    recordVideo: { dir, size: SIZE },
  });
  const page = await context.newPage();
  await page.route('**stub.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript((m) => {
    localStorage.setItem('meal-diary-local-meals', JSON.stringify(m));
    sessionStorage.setItem('splash-seen', '1');
  }, meals);
  await page.goto(`${BASE}/?variant=${variant}`);
  await page.waitForTimeout(900);
  await act(page);
  await page.waitForTimeout(600);
  const video = page.video();
  await context.close();
  const file = path.join(OUT, `${name}-${variant}.webm`);
  await rename(await video.path(), file);
  await rm(dir, { recursive: true, force: true });
  return file;
}

function sideBySide(name, left, right) {
  const out = path.join(OUT, `${name}.mp4`);
  try {
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', left, '-i', right,
      '-filter_complex', '[0:v]pad=iw+12:ih:0:0:color=white[l];[l][1:v]hstack=inputs=2,format=yuv420p[v]',
      '-map', '[v]', '-r', '30', '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', out,
    ]);
    console.log(`  ${out}`);
  } catch (err) {
    console.log(`  (no ffmpeg? kept ${left} and ${right})`, err.message);
  }
}

const scenes = {
  // A gentle drag past a third, let go still; a short flick; a long drag
  // flicked back the way it came.
  async swipe(page) {
    await page.locator('.meal-card').nth(1).click();
    await page.waitForTimeout(1200);
    let f = await finger(page, '.dish-photo');
    await f.press();
    await f.move(-150, 0, 420);
    await f.lift(250);
    await page.waitForTimeout(1300);
    f = await finger(page, '.dish-photo');
    await f.press();
    await f.move(-70, 0, 60);
    await f.lift();
    await page.waitForTimeout(1500);
    f = await finger(page, '.dish-photo');
    await f.press();
    await f.move(-190, 0, 450);
    await f.move(70, 0, 60);
    await f.lift();
    await page.waitForTimeout(1500);
  },

  // The filter sheet pulled down, then closed with its button; then the
  // action sheet (hold a dish) cancelled.
  async sheets(page) {
    await page.getByRole('button', { name: /Open filters/ }).click();
    await page.waitForTimeout(900);
    let f = await finger(page, '.filter-sheet-header', { at: 0.3 });
    await f.press();
    await f.move(0, 160, 300);
    await f.lift(250);
    await page.waitForTimeout(900);
    f = await finger(page, '.filter-sheet-header', { at: 0.3 });
    await f.press();
    await f.move(0, 90, 70);
    await f.lift();
    await page.waitForTimeout(1100);
    const close = page.getByRole('button', { name: 'Close' });
    if (await close.isVisible()) await close.click();
    await page.waitForTimeout(900);
    const card = await page.locator('.meal-card').first().boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 3);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(1000);
  },
};

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const [leek, cacio, beet] = await Promise.all(['leek', 'cacio', 'beet'].map(dataUrl));
  const MEALS = [
    dish('m3', 'Beetroot, horseradish', 'Nordic', 'Starter', '2026-09-24', beet, 'Raw and roasted in the same mouthful.'),
    dish('m2', 'Cacio e pepe', 'Italian', 'Main', '2026-09-18', cacio, 'Three ingredients, no hiding.'),
    dish('m1', 'Charred leek, hazelnut', 'French', 'Starter', '2026-09-11', leek, 'A plate built on smoke.'),
  ];
  const browser = await chromium.launch();
  console.log(`capturing to ${OUT}`);
  for (const [name, act] of Object.entries(scenes)) {
    const today = await record(browser, name, 'today', MEALS, act);
    const apple = await record(browser, name, 'apple', MEALS, act);
    sideBySide(name, today, apple);
  }

  // Stills: the type, side by side.
  for (const variant of ['today', 'apple']) {
    const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.route('**stub.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.addInitScript((m) => {
      localStorage.setItem('meal-diary-local-meals', JSON.stringify(m));
      sessionStorage.setItem('splash-seen', '1');
    }, MEALS);
    await page.goto(`${BASE}/?variant=${variant}`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `still-gallery-${variant}.png`) });
    await page.locator('.meal-card').first().click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const s = document.querySelector('.dish-scroller');
      s.scrollTop = document.querySelector('.dish-sheet').offsetTop;
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `still-recipe-${variant}.png`) });
    await context.close();
  }
  for (const still of ['gallery', 'recipe']) {
    try {
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-i', path.join(OUT, `still-${still}-today.png`), '-i', path.join(OUT, `still-${still}-apple.png`),
        '-filter_complex', '[0:v]pad=iw+24:ih:0:0:color=white[l];[l][1:v]hstack=inputs=2',
        path.join(OUT, `still-${still}.png`),
      ]);
      console.log(`  ${path.join(OUT, `still-${still}.png`)}`);
    } catch {
      // The single stills are there either way.
    }
  }
  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
