import { test, expect } from './support/network';

// Getting back into an account without the password: ask for a link on
// the sign-in screen, follow it, choose a new one. Supabase does the
// emailing; these pin what the app sends it and what the chef sees at
// each end of the email.

const USER = {
  id: 'chef-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.com',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

const CHEF = { id: USER.id, slug: 'ana', display_name: 'Ana', page_theme: 'light' };

/**
 * Stubs Supabase for these tests. `auth` answers anything under
 * /auth/v1/ and returns undefined to fall through to an empty reply.
 */
async function stub(page, auth = () => undefined) {
  await page.route('**stub.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    // Resolves true, so a handler that answered can say it did.
    const json = (status, body) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).then(() => true);
    if (url.pathname.startsWith('/auth/v1/')) {
      const handled = await auth(route, url, json);
      return handled ?? json(200, {});
    }
    if (url.pathname === '/rest/v1/chefs') return json(200, [CHEF]);
    return json(200, []);
  });
}

async function openSignIn(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

/** The address a reset email links to, with the session Supabase puts on it. */
function recoveryLink() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.round(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, email: USER.email, exp, role: 'authenticated' })}.sig`;
  const hash = new URLSearchParams({
    access_token: token,
    expires_at: String(exp),
    expires_in: '3600',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    type: 'recovery',
  });
  return `/#${hash}`;
}

test.describe('asking for a reset link', () => {
  test('Forgot password? sends a link to the email already typed', async ({ page }) => {
    let recover = null;
    await stub(page, (route, url, json) => {
      if (url.pathname === '/auth/v1/recover') {
        recover = { redirectTo: url.searchParams.get('redirect_to'), body: route.request().postDataJSON() };
        return json(200, {});
      }
    });
    await openSignIn(page);

    await page.getByLabel('Email').fill(USER.email);
    await page.getByRole('button', { name: 'Forgot password?' }).click();

    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    // No password to type here, and the email came along.
    await expect(page.getByLabel('Password')).toHaveCount(0);
    const email = page.getByLabel('Email');
    await expect(email).toHaveValue(USER.email);
    await expect(email).toBeFocused();

    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText(`If there’s an account for ${USER.email}, a reset link is on its way`);
    expect(recover.body.email).toBe(USER.email);
    // The link comes back to this app, not wherever the project's Site URL
    // happens to point.
    expect(recover.redirectTo).toBe('http://localhost:4173/');
    await expect(page.getByRole('button', { name: 'Send again' })).toBeVisible();

    // And back, with the password next to type.
    await page.getByRole('button', { name: 'Remembered it? Back to sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Password')).toBeFocused();
  });

  test('says why when Supabase won’t send one', async ({ page }) => {
    await stub(page, (route, url, json) => {
      if (url.pathname === '/auth/v1/recover') {
        return json(429, {
          code: 429,
          error_code: 'over_email_send_rate_limit',
          msg: 'For security purposes, you can only request this after 42 seconds.',
        });
      }
    });
    await openSignIn(page);
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill(USER.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('you can only request this after 42 seconds')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });
});

test.describe('following the link', () => {
  test('lands on a screen to choose a new password, and then the app', async ({ page }) => {
    let saved = null;
    await stub(page, (route, url, json) => {
      if (url.pathname !== '/auth/v1/user') return;
      if (route.request().method() === 'PUT') saved = route.request().postDataJSON();
      return json(200, USER);
    });
    await page.goto(recoveryLink());

    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await expect(page.getByText(`For ${USER.email}.`)).toBeVisible();
    // The session is out of the address bar, where it could be copied.
    expect(page.url()).not.toContain('access_token');

    // A reload mid-way doesn't skip it: the link only works once.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();

    await page.getByLabel('New password').fill('a-better-password');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
    expect(saved.password).toBe('a-better-password');

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    // Done means done: reloading now is just the app.
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toHaveCount(0);
  });

  test('an expired link says so, where a new one can be asked for', async ({ page }) => {
    await stub(page);
    await page.goto('/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('That link has expired or has already been used')).toBeVisible();
    expect(page.url()).not.toContain('error');
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  });
});
