import { test as base, expect } from '@playwright/test';

/**
 * A `test` that cannot silently reach a real backend.
 *
 * The suite is meant to be hermetic: playwright.config.js points the build
 * at https://stub.supabase.co so that no test can touch a real project.
 * That guarantee rested on nothing but the build having picked up the
 * right environment, and it can quietly stop holding -- `reuseExistingServer`
 * attaches to whatever is already listening on the port, and this machine
 * carries real VITE_SUPABASE_* values that a plain `npm run build` bakes
 * straight into dist. When that happened the stub routes stopped matching,
 * the app called the real project over the network, and the run failed on
 * an assertion about the message a chef sees -- pointing nowhere near the
 * actual cause.
 *
 * So every page here blocks the outside world, and a call to something
 * that looks like a real backend fails the test with a note about why.
 * The check runs after the test body, because the offending request is
 * usually made part-way through rather than at boot.
 */

// Hosts the app genuinely needs, and which cost nothing to allow.
const ALLOWED = new Set(['localhost', '127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com']);

// Reaching one of these means the build is pointed at something real.
const BACKEND = /(^|\.)supabase\.co$|cloudinary\.com$/;

export const test = base.extend({
  page: async ({ page }, use) => {
    const escaped = [];
    // Registered first, so a spec's own stub route -- registered later --
    // still gets first refusal. Playwright runs handlers most-recent-first.
    await page.route('**/*', (route) => {
      const { hostname } = new URL(route.request().url());
      if (ALLOWED.has(hostname)) return route.continue();
      if (hostname === 'stub.supabase.co') return route.fallback();
      if (BACKEND.test(hostname)) escaped.push(hostname);
      return route.abort();
    });

    await use(page);

    if (escaped.length > 0) {
      const hosts = [...new Set(escaped)].join(', ');
      throw new Error(
        `Not hermetic: the app called ${hosts}, a real backend rather than the ` +
          `stub. The served build is not the one this config describes -- most ` +
          `likely a preview server already on port 4173 is serving a dist built ` +
          `with this machine's own VITE_SUPABASE_* values. Stop it and re-run.`
      );
    }
  },
});

export { expect };
