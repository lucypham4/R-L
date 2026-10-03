import { test, expect } from './support/network';

// The nav pill's end icons should look equally far from its ends.
//
// "Equally far" is measured to the pill's rounded ends, not straight
// sideways. The ends are semicircles, so they curve in above and below the
// middle, and an icon that is widest near its bottom sits closer to its end
// than its horizontal gap says. That is exactly how an earlier fix -- equal
// ink spans for every glyph -- left the pill still looking tight on the
// right: the person's shoulders were its widest point and its lowest.
//
// So this samples each glyph's rendered paths, active-tab scale included,
// and takes the smallest distance from its ink to the curve of its own end.

async function endClearances(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    const r = nav.height / 2;
    const cy = nav.top + r;
    const ends = [nav.left + r, nav.right - r];
    const svgs = [...document.querySelectorAll('.bottom-nav-tab svg')];

    const clearance = (svg, cx, outward) => {
      let min = Infinity;
      for (const el of svg.querySelectorAll('path, circle')) {
        const m = el.getScreenCTM();
        const halfStroke = (parseFloat(getComputedStyle(el).strokeWidth) / 2) * Math.hypot(m.a, m.b);
        const len = el.getTotalLength();
        for (let i = 0; i <= 600; i++) {
          const p = el.getPointAtLength((len * i) / 600).matrixTransform(m);
          // Only ink on the outer side of the end's centre faces the curve.
          if ((p.x - cx) * outward <= 0) continue;
          min = Math.min(min, r - Math.hypot(p.x - cx, p.y - cy) - halfStroke);
        }
      }
      return min;
    };
    return { left: clearance(svgs[0], ends[0], -1), right: clearance(svgs.at(-1), ends[1], 1) };
  });
}

test('the nav pill looks as roomy at its right end as at its left', async ({ page }) => {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript(() => localStorage.setItem('onboarding-seen-local', '1'));
  await page.goto('/');
  await expect(page.locator('.bottom-nav')).toBeVisible();
  // The active tab's icon scales up on a transition; measure it settled.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

  const { left, right } = await endClearances(page);
  expect(Math.abs(left - right), `left ${left.toFixed(2)}px, right ${right.toFixed(2)}px`).toBeLessThan(0.5);
});

test('the page fades out under the pill, from solid at the bottom edge to clear above it', async ({ page }) => {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.addInitScript(() => localStorage.setItem('onboarding-seen-local', '1'));
  await page.goto('/');
  const fade = page.locator('.bottom-nav-fade');
  await expect(fade).toBeVisible();

  const look = await page.evaluate(() => {
    const el = document.querySelector('.bottom-nav-fade');
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      fullWidth: r.left === 0 && r.right === document.documentElement.clientWidth,
      onBottomEdge: Math.abs(r.bottom - window.innerHeight) < 1,
      risesPastPill: r.top < nav.top,
      under: Number(cs.zIndex) < Number(getComputedStyle(document.querySelector('.bottom-nav')).zIndex),
      gradient: cs.backgroundImage,
      taps: cs.pointerEvents,
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(look).toMatchObject({ fullWidth: true, onBottomEdge: true, risesPastPill: true, under: true, taps: 'none' });
  // Drawn upwards: the page's own colour first, nothing at the top.
  expect(look.gradient.startsWith('linear-gradient(to top, ' + look.bg)).toBe(true);
  expect(look.gradient).toMatch(/rgba\(0, 0, 0, 0\)\)$/);

  // No nav on a wide screen, so no fade either.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(fade).toBeHidden();
});
