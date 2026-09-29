import { test, expect } from './support/network';
import { fileURLToPath } from 'node:url';

// The chef's picture in the top right, which opens Settings, and what
// Settings lets them do with it and with their password.

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
async function boot(page, { signedIn = false, auth = () => undefined } = {}) {
  const calls = [];
  let chef = { ...CHEF };
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
    return json([]);
  });
  await page.addInitScript((stored) => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('onboarding-seen-chef-1', '1');
    if (stored) localStorage.setItem('sb-stub-auth-token', JSON.stringify(stored));
  }, signedIn ? session() : null);
  await page.goto('/');
  return calls;
}

const avatarImage = (page, scope) => page.locator(`${scope} .avatar img`);

/** Picks the dish photo as a new profile picture and confirms the crop. */
async function choosePhoto(page) {
  await page.locator('.settings-page input[type="file"]').setInputFiles(DISH_PHOTO);
  await expect(page.getByRole('dialog', { name: 'Crop photo' })).toBeVisible();
  // Framed as the circle it will be shown in, with no aspect to choose.
  await expect(page.locator('.photo-crop-viewport-round')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Crop aspect ratio' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use photo' }).click();
  await expect(page.getByRole('dialog', { name: 'Crop photo' })).toHaveCount(0);
}

test.describe('the picture in the top right', () => {
  test('is a grey default until one is chosen, and opens Settings', async ({ page }) => {
    await boot(page);
    const button = page.getByRole('button', { name: 'Settings' });
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
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('is there on a wide screen too, where there is no nav', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await boot(page);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('a guest chooses one in Settings, and this device keeps it', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Add photo' }).isVisible();
    await choosePhoto(page);
    await expect(avatarImage(page, '.settings-profile')).toHaveAttribute('src', /^data:image\/jpeg/);
    await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(avatarImage(page, '.gallery-avatar')).toHaveAttribute('src', /^data:image\/jpeg/);
    await page.reload();
    await expect(avatarImage(page, '.gallery-avatar')).toHaveAttribute('src', /^data:image\/jpeg/);

    // And back to the default.
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.settings-profile .avatar-default')).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.gallery-avatar .avatar-default')).toBeVisible();
  });

  test('a chef’s is saved to their profile, so it follows them', async ({ page }) => {
    const calls = await boot(page, { signedIn: true });
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByText(USER.email)).toBeVisible();
    await expect(page.locator('.settings-profile-name')).toHaveText('Ana');
    await choosePhoto(page);
    await expect(avatarImage(page, '.settings-profile')).toHaveAttribute('src', /^data:image\/jpeg/);
    const saved = calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/chefs');
    expect(saved.body.avatar_url).toMatch(/^data:image\/jpeg/);
    expect(saved.search).toContain('id=eq.chef-1');
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
    await page.getByRole('button', { name: 'Settings' }).click();
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
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.getByRole('button', { name: 'Forgot it? Email me a reset link' }).click();
    await expect(page.getByRole('status')).toHaveText(`A reset link is on its way to ${USER.email}.`);
    expect(recover.email).toBe(USER.email);
  });

  test('isn’t offered to a guest, who has no password', async ({ page }) => {
    await boot(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change password' })).toHaveCount(0);
  });
});
