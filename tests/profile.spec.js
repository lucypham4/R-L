import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// The chef's picture in the top right, which opens their profile: the
// picture, name and bio clients see, with Edit, Share and Settings beside
// them. And what Settings lets them do with their password.

const DISH_PHOTO = fileURLToPath(new URL('./fixtures/dish.png', import.meta.url));

const USER = {
  id: 'chef-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const CHEF = { id: USER.id, slug: 'ana', display_name: 'Ana', page_theme: 'light' };

function session() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.round(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: USER.id, exp })}.sig`,
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: exp,
    token_type: 'bearer',
    user: USER,
  };
}

/**
 * Boots the app, signed in or not. `auth` answers /auth/v1/ calls it
 * cares about and returns undefined for the rest. Every request is kept
 * in `calls`.
 */
async function boot(page, { signedIn = false, auth = () => undefined, chef: initialChef = CHEF, path = '/', meals = [] } = {}) {
  const calls = [];
  let chef = { ...initialChef };
  await page.route('**stub.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    calls.push({ method: req.method(), path: url.pathname, search: url.search, body: req.postDataJSON?.() ?? null });
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).then(() => true);
    if (url.pathname.startsWith('/auth/v1/')) {
      if (await auth(route, url, json)) return;
      return json(url.pathname === '/auth/v1/user' ? USER : {});
    }
    if (url.pathname === '/rest/v1/chefs') {
      if (req.method() === 'PATCH') {
        chef = { ...chef, ...req.postDataJSON() };
        return json(chef);
      }
      return json([chef]);
    }
    if (url.pathname === '/rest/v1/meals') return json(meals);
    return json([]);
  });
  await page.addInitScript((stored) => {
    if (stored) localStorage.setItem('sb-stub-auth-token', JSON.stringify(stored));
  }, signedIn ? session() : null);
  await page.goto(path);
  return calls;
}

const avatarImage = (page, scope) => page.locator(`${scope} .avatar img`);

async function openProfile(page) {
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
}

async function openSettings(page) {
  await openProfile(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

/** Picks the dish photo as a new profile picture and confirms the crop. */
async function choosePhoto(page) {
  await page.locator('.profile-page input[type="file"]').setInputFiles(DISH_PHOTO);
  await expect(page.getByRole('dialog', { name: 'Crop photo' })).toBeVisible();
  // Framed as the circle it will be shown in, with no aspect to choose.
  await expect(page.locator('.photo-crop-viewport-round')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Crop aspect ratio' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByRole('dialog', { name: 'Crop photo' })).toHaveCount(0);
}

test.describe('the picture in the top right', () => {
  test('is a grey default until one is chosen, and opens your profile', async ({ page }) => {
    await boot(page);
    const button = page.getByRole('button', { name: 'My profile' });
    await expect(button).toBeVisible();
    // Top right of the gallery's header.
    const box = await button.boundingBox();
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box.x + box.width).toBeGreaterThan(width - 40);
    expect(box.y).toBeLessThan(100);
    await expect(button.locator('.avatar-default')).toBeVisible();

    // Profile is no longer a tab down at the bottom.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('button')).toHaveCount(2);
    await expect(nav.getByRole('button', { name: 'Profile' })).toHaveCount(0);

    await button.click();
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
    // Not Settings: that's the gear, one tap further in.
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: 'My profile' })).toBeVisible();
  });

  test('is there on a wide screen too, where there is no nav', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await boot(page);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
    await openProfile(page);
  });
});

test.describe('the profile', () => {
  test('a guest’s: a picture this device keeps, and the way to a name and a bio', async ({ page }) => {
    await boot(page);
    await openProfile(page);
    await expect(page.locator('.profile-name')).toHaveText('Your kitchen');
    // No page yet: where the bio would be, the way to one.
    await expect(page.getByRole('region', { name: 'Your public page' })).toContainText(
      'Sign up with your email to make your page live.'
    );
    await expect(page.getByRole('region', { name: 'Bio' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View public page' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Name')).toHaveCount(0);
    // Leaving mid-edit would lose the edit, so the only ways out are
    // Save and Cancel.
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await choosePhoto(page);
    // Shown in the form, but not saved until Save.
    await expect(avatarImage(page, '.profile-photo')).toHaveAttribute('src', /^blob:/);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(avatarImage(page, '.profile-hero')).toHaveAttribute('src', /^data:image\/jpeg/);
    await expect(page.getByRole('button', { name: 'Edit' })).toBeFocused();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(avatarImage(page, '.gallery-avatar')).toHaveAttribute('src', /^data:image\/jpeg/);
    await page.reload();
    await expect(avatarImage(page, '.gallery-avatar')).toHaveAttribute('src', /^data:image\/jpeg/);

    // And back to the default.
    await openProfile(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.profile-hero .avatar-default')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.gallery-avatar .avatar-default')).toBeVisible();
  });

  test('a guest signs up or in from their profile, without going through Settings', async ({ page }) => {
    await boot(page);
    await openProfile(page);
    const card = page.getByRole('region', { name: 'Your public page' });
    await card.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByRole('button', { name: 'Not now, continue without an account' }).click();
    // Back where they asked from.
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();

    await card.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('a guest who tries to share their page is asked to sign up, and can decline', async ({ page }) => {
    await boot(page);
    await openProfile(page);
    const share = page.getByRole('button', { name: 'Share your page' });
    const prompt = page.getByRole('dialog', { name: 'Sign up with your email to make your page live.' });

    await share.click();
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole('button', { name: 'Sign up' })).toBeFocused();
    await prompt.getByRole('button', { name: 'Not now' }).click();
    await expect(prompt).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();

    await share.click();
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);

    // Asking again isn't remembered against them: it's there every time.
    await share.click();
    await prompt.getByRole('button', { name: 'I already have an account' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByRole('button', { name: 'Not now, continue without an account' }).click();

    await share.click();
    await prompt.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });

  test('a chef’s page is a button beside their links', async ({ page }) => {
    await boot(page, { signedIn: true, chef: { ...CHEF, links: { instagram: 'ana.cooks' } } });
    await openProfile(page);
    const row = page.locator('.profile-links-row');
    await expect(row.getByRole('link', { name: /Instagram/ })).toBeVisible();
    const view = row.getByRole('link', { name: 'View public page' });
    await expect(view).toHaveAttribute('href', /\/ana$/);
    await expect(view).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('region', { name: 'Your public page' })).toHaveCount(0);
  });

  test('Cancel leaves the picture as it was', async ({ page }) => {
    await boot(page);
    await openProfile(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await choosePhoto(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.profile-hero .avatar-default')).toBeVisible();
  });

  test('a chef’s picture is saved to their profile, so it follows them', async ({ page }) => {
    const calls = await boot(page, { signedIn: true });
    await openProfile(page);
    await expect(page.locator('.profile-name')).toHaveText('Chef Ana');
    await page.getByRole('button', { name: 'Edit' }).click();
    await choosePhoto(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(avatarImage(page, '.profile-hero')).toHaveAttribute('src', /^data:image\/jpeg/);
    const saved = calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/chefs');
    expect(saved.body.avatar_url).toMatch(/^data:image\/jpeg/);
    expect(saved.search).toContain('id=eq.chef-1');
    // Nothing else changed, so nothing else was written.
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });

  test('a chef writes their name and a short bio', async ({ page }) => {
    const calls = await boot(page, { signedIn: true });
    await openProfile(page);
    await expect(page.getByRole('region', { name: 'Bio' })).toContainText('No bio yet');

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Name')).toBeFocused();
    await expect(page.getByLabel('Name')).toHaveValue('Ana');
    await page.getByLabel('Name').fill('');
    await page.getByLabel('Short bio').fill('Seasonal Vietnamese, cooked in your kitchen.');
    await page.getByRole('button', { name: 'Save' }).click();
    // The browser's own check stops an empty name before it's sent.
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);

    await page.getByLabel('Name').fill('Ana Tran');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.profile-name')).toHaveText('Chef Ana Tran');
    await expect(page.getByRole('region', { name: 'Bio' })).toHaveText('Seasonal Vietnamese, cooked in your kitchen.');
    const saved = calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/chefs');
    expect(saved.body).toEqual({ display_name: 'Ana Tran', bio: 'Seasonal Vietnamese, cooked in your kitchen.' });
    expect(saved.search).toContain('id=eq.chef-1');

    // Cancel throws away what was typed.
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Short bio').fill('Something else');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('region', { name: 'Bio' })).toHaveText('Seasonal Vietnamese, cooked in your kitchen.');
  });

  test('a name that already says Chef isn’t given another', async ({ page }) => {
    await boot(page, { signedIn: true, chef: { ...CHEF, display_name: 'Chef Ana' } });
    await openProfile(page);
    await expect(page.locator('.profile-name')).toHaveText('Chef Ana');
  });

  test('says so when the profile can’t be saved', async ({ page }) => {
    await boot(page, { signedIn: true });
    await page.route('**stub.supabase.co/rest/v1/chefs**', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'bio' column of 'chefs' in the schema cache" }),
          })
        : route.fallback()
    );
    await openProfile(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Short bio').fill('Hello');
    await page.getByRole('button', { name: 'Save' }).click();
    // Said in a chef's words, not the database's.
    await expect(page.getByText("This app isn't set up to save bios yet, so nothing was saved. Try again once it is.")).toBeVisible();
    await expect(page.getByText('schema cache')).toHaveCount(0);
    // Still editing, with what was typed.
    await expect(page.getByLabel('Short bio')).toHaveValue('Hello');
  });

  test('Share hands the public page to the share sheet', async ({ page }) => {
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.share = async (data) => {
        window.__shared.push(data);
      };
    });
    await boot(page, { signedIn: true });
    await openProfile(page);
    await expect(page.locator('.profile-address')).toHaveText(/\/ana$/);
    await page.getByRole('button', { name: 'Share your page' }).click();
    await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([
      { title: 'Chef Ana', url: expect.stringMatching(/^http:\/\/localhost:\d+\/ana$/) },
    ]);
  });

  test('without a share sheet, Share copies the link', async ({ page }) => {
    await page.addInitScript(() => {
      delete Navigator.prototype.share;
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (text) => window.__copied.push(text) },
      });
    });
    await boot(page, { signedIn: true });
    await openProfile(page);
    await page.getByRole('button', { name: 'Share your page' }).click();
    await expect(page.getByRole('status')).toHaveText('Link copied.');
    expect(await page.evaluate(() => window.__copied)).toEqual([expect.stringMatching(/\/ana$/)]);
  });

  test('the gear opens Settings, and Back comes back to the profile', async ({ page }) => {
    await boot(page, { signedIn: true });
    await openSettings(page);
    await expect(page.getByText(USER.email)).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  });

  test('a chef picks specialties and adds their links', async ({ page }) => {
    const calls = await boot(page, { signedIn: true });
    await openProfile(page);
    await expect(page.getByRole('list', { name: 'Specialties' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Add Pastry' }).click();
    await page.getByRole('button', { name: 'Add Seasonal' }).click();
    await page.getByLabel('Add a specialty').fill('Vietnamese');
    await page.getByLabel('Add a specialty').press('Enter');
    // Enter adds the tag; it doesn't save the form.
    await expect(page.getByLabel('Add a specialty')).toHaveValue('');
    await expect(page.getByRole('form', { name: 'Edit profile' })).toBeVisible();
    // Changed my mind about one.
    await page.getByRole('button', { name: 'Remove Seasonal' }).click();
    await expect(page.getByRole('list', { name: 'Your specialties' }).getByRole('listitem')).toHaveText([
      'Pastry',
      'Vietnamese',
    ]);

    // A handle, a pasted profile link, and a bare address.
    await page.getByLabel('Instagram').fill('@ana.cooks');
    await page.getByLabel('TikTok').fill('https://www.tiktok.com/@anacooks?lang=en');
    await page.getByLabel('Website').fill('anatran.com');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('list', { name: 'Specialties' }).getByRole('listitem')).toHaveText([
      'Pastry',
      'Vietnamese',
    ]);
    const links = page.getByRole('list', { name: 'Links' }).getByRole('link');
    await expect(links).toHaveText(['Instagram: @ana.cooks', 'TikTok: @anacooks', 'Website: anatran.com']);
    await expect(links.nth(0)).toHaveAttribute('href', 'https://instagram.com/ana.cooks');
    await expect(links.nth(1)).toHaveAttribute('href', 'https://www.tiktok.com/@anacooks');
    await expect(links.nth(2)).toHaveAttribute('href', 'https://anatran.com/');

    const saved = calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/chefs');
    // Only what changed is written.
    expect(saved.body).toEqual({
      specialties: ['Pastry', 'Vietnamese'],
      links: { instagram: 'ana.cooks', tiktok: 'anacooks', website: 'https://anatran.com/' },
    });
  });

  test('the edit form fits a narrow phone, link fields included', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await boot(page, { signedIn: true });
    await openProfile(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByLabel('Website')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return [...document.querySelectorAll('.profile-form input, .profile-form textarea')]
        .filter((el) => el.getBoundingClientRect().right > width + 0.5)
        .map((el) => el.id || el.name || el.placeholder);
    });
    expect(overflow).toEqual([]);
  });

  test('a link that isn’t one is caught before saving', async ({ page }) => {
    const calls = await boot(page, { signedIn: true });
    await openProfile(page);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('YouTube').fill('https://www.youtube.com/channel/UC123');
    await page.getByLabel('Website').fill('my site');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText("That doesn't look like a YouTube or Website link.")).toBeVisible();
    await expect(page.getByLabel('YouTube')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  test('clients read the bio, specialties and links on the public page', async ({ page }) => {
    await boot(page, {
      path: '/ana',
      chef: {
        ...CHEF,
        bio: 'Seasonal Vietnamese, cooked in your kitchen.',
        specialties: ['Pastry', 'Vietnamese'],
        // As stored, plus what a hand-edited row could hold.
        links: { instagram: 'ana.cooks', website: 'javascript:alert(1)', myspace: 'ana' },
      },
    });
    await expect(page.getByRole('heading', { name: 'Ana' })).toBeVisible();
    await expect(page.locator('.public-chef-bio')).toHaveText('Seasonal Vietnamese, cooked in your kitchen.');
    await expect(page.getByRole('list', { name: 'Specialties' }).getByRole('listitem')).toHaveText([
      'Pastry',
      'Vietnamese',
    ]);
    // Only what parses as a real link becomes one.
    const links = page.getByRole('list', { name: 'Links' }).getByRole('link');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute('href', 'https://instagram.com/ana.cooks');
  });
});

test.describe('the public page', () => {
  const photo = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#b56"/></svg>');
  const MEALS = Array.from({ length: 8 }, (_, i) => ({
    id: `m${i}`,
    name: `Dish ${i}`,
    cuisine: 'French',
    category: 'Main',
    date: `2026-09-${String(10 + i).padStart(2, '0')}`,
    photos: [photo],
    ingredients: [],
    method: [],
  }));

  const box = (locator) => locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });
  // Scrolls, then waits for the frame the scroll event draws.
  const scrollTo = (page, y) =>
    page.evaluate(async (top) => {
      window.scrollTo(0, top);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, y);

  // The scroll at which the name has risen into the bar: the collapsed rest,
  // where its snap area starts.
  const collapseAt = (page) =>
    page.evaluate(() => document.querySelector('.public-chef-snap-area').getBoundingClientRect().top + window.scrollY);
  const noSnap = (page) => page.evaluate(() => (document.documentElement.style.scrollSnapType = 'none'));
  const opacity = (locator) => locator.evaluate((el) => Number(getComputedStyle(el).opacity));

  test('carries the picture and name into the bar at the top left as the page scrolls', async ({ page }) => {
    await boot(page, { path: '/ana', meals: MEALS, chef: { ...CHEF, bio: 'Seasonal Vietnamese.' } });
    await expect(page.getByRole('heading', { name: 'Chef Ana' })).toBeVisible();
    const avatar = page.locator('.public-chef-travel-avatar');
    const large = page.locator('.public-chef-travel-name:not(.public-chef-travel-name-small)');
    const small = page.locator('.public-chef-travel-name-small');
    const width = await page.evaluate(() => document.documentElement.clientWidth);

    // At the top: large and centred, exactly over the header's own.
    await expect.poll(async () => Math.round((await box(avatar)).w)).toBe(112);
    const slot = await box(page.locator('.public-chef-avatar-slot'));
    const top = await box(avatar);
    expect(Math.abs(top.cx - slot.cx)).toBeLessThan(1);
    expect(Math.abs(top.cy - slot.cy)).toBeLessThan(1);
    expect(Math.abs(top.cx - width / 2)).toBeLessThan(1);
    expect(Math.abs((await box(large)).cx - width / 2)).toBeLessThan(2);
    const nameTopBottom = (await box(large)).y + (await box(large)).h + 12;
    expect(await opacity(large)).toBe(1);
    expect(await opacity(small)).toBe(0);

    // The whole journey, sampled: the picture only shrinks, and never by a
    // jump; it goes across before it goes up; and it never crosses the
    // name rising beside it.
    await noSnap(page);
    const D = await collapseAt(page);
    let prev = top;
    const samples = [];
    for (let i = 1; i <= 20; i++) {
      await scrollTo(page, (D * i) / 20);
      const a = await box(avatar);
      const n = await box((await opacity(large)) >= 0.5 ? large : small);
      samples.push({ a, n });
      expect(a.w).toBeLessThanOrEqual(prev.w + 0.01);
      expect(prev.w - a.w).toBeLessThan(15);
      const clear = a.x + a.w <= n.x || a.y + a.h <= n.y;
      expect(clear, `picture and name overlap at ${i * 5}%`).toBe(true);
      prev = a;
    }
    // Across first: a quarter of the way, it has gone further left than up.
    const q = samples[4].a;
    expect((top.cx - q.cx) / (top.cx - 48)).toBeGreaterThan((top.cy - q.cy) / (top.cy - 60));
    // Part way, it is part way.
    expect(samples[3].a.w).toBeGreaterThan(56);
    expect(samples[3].a.w).toBeLessThan(112);

    // Unhurried: the collapse takes twice the name's own rise of scroll, so
    // the name rises at half the page's speed, as the dish's does.
    const nameRise = (await page.evaluate(() => {
      const n = document.querySelector('.public-chef-name > span').getBoundingClientRect();
      const s = document.querySelector('.public-chef-bar-name').getBoundingClientRect();
      return n.top + window.scrollY + n.height / 2 - (s.top + s.height / 2);
    }));
    expect(D / nameRise).toBeGreaterThan(1.9);

    // The backdrop's lower edge follows the header up: half-way, it sits
    // between where the header ends at the top and where the bar ends, or,
    // once the search is riding up under the name (this header is short),
    // just under the search, so what slides by goes under that too.
    await scrollTo(page, D * 0.5);
    const edge = await page.locator('.public-chef-bar-backdrop').evaluate((el) => el.getBoundingClientRect().bottom);
    const barBottom = await page.locator('.public-chef-bar').evaluate((el) => el.getBoundingClientRect().bottom);
    const held = await box(page.locator('.gallery-search'));
    expect(edge).toBeGreaterThan(barBottom);
    expect(edge).toBeLessThanOrEqual(Math.max(nameTopBottom, held.y + held.h + 12) + 0.5);

    // The names hand over between 45% and 55%: half-way, both show.
    await scrollTo(page, D * 0.5);
    expect(await opacity(large)).toBeGreaterThan(0);
    expect(await opacity(small)).toBeGreaterThan(0);

    // All the way: small, at the top left, the small name beside it.
    await scrollTo(page, D + 400);
    await expect.poll(async () => Math.round((await box(avatar)).w)).toBe(56);
    const end = await box(avatar);
    const nameEnd = await box(small);
    expect(Math.round(end.x)).toBe(20);
    expect(Math.abs(nameEnd.x - (end.x + end.w + 12))).toBeLessThan(1);
    expect(Math.abs(nameEnd.cy - end.cy)).toBeLessThan(2);
    expect(await opacity(large)).toBe(0);
    expect(await opacity(small)).toBe(1);
    // Whole, not cut short with an ellipsis.
    expect(await small.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator('.public-chef-bar-backdrop')).toHaveCSS('opacity', '1');

    // And back.
    await scrollTo(page, 0);
    await expect.poll(async () => Math.round((await box(avatar)).w)).toBe(112);

    // The travelling copies are for the eye; the heading is the header's.
    for (const el of [avatar, large, small, page.locator('.public-chef-bar')]) {
      await expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(await el.evaluate((n) => getComputedStyle(n).pointerEvents)).toBe('none');
    }
  });

  test('a release between the two rests settles on the nearer one; further down scrolls freely', async ({ page }) => {
    // Plenty of dishes under the collapse. With eight the page left only
    // just over 400px below it, a margin that a line of text wrapping or
    // not wrapping (tracked capitals were wider than sentence case) could
    // spend, and the point here is how the page snaps, not how long it is.
    const many = [...MEALS, ...MEALS.map((m) => ({ ...m, id: `${m.id}b`, name: `${m.name} again` }))];
    await boot(page, { path: '/ana', meals: many });
    await expect.poll(async () => Math.round((await box(page.locator('.public-chef-travel-avatar'))).w)).toBe(112);
    const D = await collapseAt(page);
    const settle = async (y) => {
      await scrollTo(page, y);
      await page.waitForTimeout(400);
      return page.evaluate(() => window.scrollY);
    };
    expect(await settle(D * 0.3)).toBe(0);
    expect(Math.abs((await settle(D * 0.7)) - D)).toBeLessThan(2);
    // Among the dishes, between the collapse and the end of the page.
    const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const far = Math.round((D + max) / 2);
    expect(far - D).toBeGreaterThan(200);
    expect(Math.abs((await settle(far)) - far)).toBeLessThan(2);
  });

  test('the search docks in the bar under the name, and stays there as the dishes scroll on', async ({ page }) => {
    await boot(page, { path: '/ana', meals: MEALS, chef: { ...CHEF, bio: 'Seasonal Vietnamese.' } });
    const avatar = page.locator('.public-chef-travel-avatar');
    await expect.poll(async () => Math.round((await box(avatar)).w)).toBe(112);
    const search = page.locator('.gallery-search');
    const input = page.getByRole('searchbox', { name: 'Search dishes' });
    await expect(input).toHaveAttribute('placeholder', 'Search dishes…');

    // At the top it is in the page, under the header.
    const atTop = await box(search);
    const nameBottom = (await box(page.locator('.public-chef-name'))).y + (await box(page.locator('.public-chef-name'))).h;
    expect(atTop.y).toBeGreaterThan(nameBottom);

    await noSnap(page);
    const D = await collapseAt(page);
    const slot = await box(page.locator('.public-chef-bar-search'));
    // Collapsed, and far down the page: in the bar's second row, under the
    // name, the backdrop running on under it.
    for (const y of [D, D + 300, D + 700]) {
      await scrollTo(page, y);
      const s = await box(search);
      expect(Math.abs(s.y - slot.y), `at ${Math.round(y)}`).toBeLessThan(1);
      const name = await box(page.locator('.public-chef-travel-name-small'));
      expect(s.y).toBeGreaterThan(name.y + name.h);
      const edge = await page.locator('.public-chef-bar-backdrop').evaluate((el) => el.getBoundingClientRect().bottom);
      expect(edge).toBeGreaterThanOrEqual(s.y + s.h);
    }
    // Stuck by CSS once docked, so it holds still with nothing scripted on it.
    expect(await search.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    expect(await search.evaluate((el) => el.style.translate)).toBe('');
    // It is the page's own search, not a copy: one box, and it takes taps.
    await expect(page.getByRole('searchbox')).toHaveCount(1);
    expect(await search.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto');
  });

  test('with a short header the search rises with the name, never across it', async ({ page }) => {
    // No bio and no specialties: the search starts just under the name, so
    // it meets its lane early and rides it up with the collapse.
    await boot(page, { path: '/ana', meals: MEALS });
    const avatar = page.locator('.public-chef-travel-avatar');
    await expect.poll(async () => Math.round((await box(avatar)).w)).toBe(112);
    const search = page.locator('.gallery-search');
    const large = page.locator('.public-chef-travel-name:not(.public-chef-travel-name-small)');
    const small = page.locator('.public-chef-travel-name-small');
    await noSnap(page);
    const D = await collapseAt(page);
    let held = 0;
    for (let i = 0; i <= 20; i++) {
      await scrollTo(page, (D * i) / 20);
      const s = await box(search);
      const a = await box(avatar);
      const n = await box((await opacity(large)) >= 0.5 ? large : small);
      expect(s.y, `search under the name at ${i * 5}%`).toBeGreaterThanOrEqual(n.y + n.h);
      expect(s.y, `search under the picture at ${i * 5}%`).toBeGreaterThanOrEqual(a.y + a.h);
      if (await search.evaluate((el) => el.style.translate !== '')) held += 1;
      // Once held, the backdrop reaches under it.
      const natural = await page.evaluate(() => {
        const el = document.querySelector('.gallery-search');
        return el.style.translate ? parseFloat(el.style.translate.split(' ')[1]) : 0;
      });
      if (natural > 12) {
        const edge = await page.locator('.public-chef-bar-backdrop').evaluate((el) => el.getBoundingClientRect().bottom);
        expect(edge).toBeGreaterThanOrEqual(s.y + s.h);
      }
    }
    // It did ride the lane on the way (held by the script), and ends docked.
    expect(held).toBeGreaterThan(3);
    const slot = await box(page.locator('.public-chef-bar-search'));
    expect(Math.abs((await box(search)).y - slot.y)).toBeLessThan(1);
  });

  test('searching from the docked bar keeps it collapsed and brings the results up under it', async ({ page }) => {
    const many = [...MEALS, ...MEALS.map((m) => ({ ...m, id: `${m.id}b`, name: `${m.name} again` }))];
    await boot(page, { path: '/ana', meals: many, chef: { ...CHEF, bio: 'Seasonal Vietnamese.' } });
    const avatar = page.locator('.public-chef-travel-avatar');
    await expect.poll(async () => Math.round((await box(avatar)).w)).toBe(112);
    await noSnap(page);
    const D = await collapseAt(page);
    await scrollTo(page, D + 900);

    await page.getByRole('searchbox', { name: 'Search dishes' }).fill('Dish 3 again');
    await expect(page.locator('.meal-card')).toHaveCount(1);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    // Still collapsed, the search still docked, the one result on screen
    // just under it rather than somewhere above.
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeGreaterThanOrEqual(D - 1);
    expect(Math.round((await box(avatar)).w)).toBe(56);
    const s = await box(page.locator('.gallery-search'));
    const card = await box(page.locator('.meal-card'));
    expect(card.y).toBeGreaterThan(s.y + s.h);
    expect(card.y).toBeLessThan(await page.evaluate(() => window.innerHeight / 2));

    // Cleared, it all comes back, and the reader stays where they were put.
    await page.getByRole('searchbox', { name: 'Search dishes' }).fill('');
    await expect(page.locator('.meal-card')).toHaveCount(many.length);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(2);
    // Whatever room was made for the results is given back.
    expect(await page.locator('.gallery-count').evaluate((el) => el.style.marginTop)).toBe('');
  });

  test('the count goes before the bar’s soft edge, rather than resting half-faded in it', async ({ page }) => {
    await boot(page, { path: '/ana', meals: MEALS, chef: { ...CHEF, bio: 'Seasonal Vietnamese.' } });
    const count = page.locator('.gallery-count');
    await expect.poll(async () => Math.round((await box(page.locator('.public-chef-travel-avatar'))).w)).toBe(112);
    expect(await opacity(count)).toBe(1);
    await noSnap(page);
    for (let i = 0; i <= 30; i++) {
      await scrollTo(page, i * 15);
      const o = await opacity(count);
      const c = await box(count);
      const edge = await page.locator('.public-chef-bar-backdrop').evaluate((el) => el.getBoundingClientRect().bottom + parseFloat(getComputedStyle(el, '::after').height));
      // Anything still showing is clear of the backdrop and its fade.
      if (o > 0) expect(c.y, `count at scroll ${i * 15}`).toBeGreaterThanOrEqual(edge - 0.5);
    }
  });

  test('with reduced motion, the picture and name jump between the rests instead of travelling', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page, { path: '/ana', meals: MEALS });
    const avatar = page.locator('.public-chef-travel-avatar');
    await expect.poll(async () => Math.round((await box(avatar)).w)).toBe(112);
    await noSnap(page);
    const D = await collapseAt(page);

    // Before half-way nothing moves: it holds its rest, as the dish's
    // pieces do, while the page scrolls on under the header.
    await scrollTo(page, D * 0.4);
    await expect.poll(async () => Math.round((await box(avatar)).y)).toBe(32);
    expect(Math.round((await box(avatar)).w)).toBe(112);

    // Past it, it is in the bar.
    await scrollTo(page, D * 0.6);
    await expect.poll(async () => Math.round((await box(avatar)).w)).toBe(56);

    // And once collapsed, the search is docked under it.
    await scrollTo(page, D + 200);
    const slot = await box(page.locator('.public-chef-bar-search'));
    expect(Math.abs((await box(page.locator('.gallery-search'))).y - slot.y)).toBeLessThan(1);
  });
});

test.describe('changing the password', () => {
  test('checks the current one, then sets the new one', async ({ page }) => {
    const signIns = [];
    let updated = null;
    await boot(page, {
      signedIn: true,
      auth: (route, url, json) => {
        if (url.pathname === '/auth/v1/token') {
          const body = route.request().postDataJSON();
          signIns.push(body);
          if (body.password !== 'old-password') {
            return json({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
          }
          return json(session());
        }
        if (url.pathname === '/auth/v1/user' && route.request().method() === 'PUT') {
          updated = route.request().postDataJSON();
          return json(USER);
        }
      },
    });
    await openSettings(page);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByLabel('Current password')).toBeFocused();

    await page.getByLabel('Current password').fill('wrong-guess');
    await page.getByLabel('New password').fill('a-better-password');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.getByText("That isn't your current password.")).toBeVisible();
    expect(updated).toBeNull();

    await page.getByLabel('Current password').fill('old-password');
    await page.getByRole('button', { name: 'Save password' }).click();
    // Still on Settings -- re-checking the password replaced the session,
    // which used to blank the whole app while it refetched the profile.
    await expect(page.getByRole('status')).toHaveText('Password changed. Use the new one next time you sign in.');
    expect(signIns.at(-1)).toMatchObject({ email: USER.email, password: 'old-password' });
    expect(updated.password).toBe('a-better-password');
    await expect(page.getByRole('button', { name: 'Change password' })).toBeFocused();
  });

  test('forgot the current one: a reset link from right there', async ({ page }) => {
    let recover = null;
    await boot(page, {
      signedIn: true,
      auth: (route, url, json) => {
        if (url.pathname === '/auth/v1/recover') {
          recover = route.request().postDataJSON();
          return json({});
        }
      },
    });
    await openSettings(page);
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByRole('button', { name: 'Forgot it? Email me a reset link' }).click();
    await expect(page.getByRole('status')).toHaveText(`A reset link is on its way to ${USER.email}.`);
    expect(recover.email).toBe(USER.email);
  });

  test('isn’t offered to a guest, who has no password', async ({ page }) => {
    await boot(page);
    await openSettings(page);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change password' })).toHaveCount(0);
  });
});
