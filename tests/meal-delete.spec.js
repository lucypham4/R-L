import { test, expect } from './support/network';

// Deleting a dish. For a signed-in chef this used to look as if it worked
// and change nothing: meals have row-level security and had no delete
// policy, and a delete no policy allows isn't an error -- it matches no
// rows and reports success. The dish left the screen and was back on the
// next reload. meal-delete-migration.sql adds the policy; these pin that
// the app believes the server's answer, not its own optimism.

const USER = {
  id: 'chef-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

const dish = (id, name, date) => ({
  id,
  name,
  cuisine: 'French',
  category: 'Main',
  date,
  serves: 2,
  photos: [],
  ingredients: [],
  method: [],
  description: `${name}, described.`,
  note: '',
});

const MEALS = [dish('m2', 'Cacio e pepe', '2026-09-18'), dish('m1', 'Charred leek', '2026-09-11')];

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
 * Signs in (or not) with MEALS. `deletes` is whether the server's delete
 * actually removes a row, as it does once the policy exists; false is the
 * old behaviour, an empty success. Deletes are kept in `calls`.
 */
async function boot(page, { signedIn = true, deletes = true } = {}) {
  const calls = [];
  await page.route('**stub.supabase.co/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return json(USER);
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    if (url.pathname === '/rest/v1/chefs') return json([{ id: USER.id, slug: 'ana', display_name: 'Ana', page_theme: 'light' }]);
    if (url.pathname === '/rest/v1/meals') {
      if (req.method() === 'DELETE') {
        calls.push({ search: url.search, prefer: req.headers()['prefer'] ?? '' });
        const id = url.searchParams.get('id')?.replace('eq.', '');
        return json(deletes ? [{ id }] : []);
      }
      return json(MEALS.map((m) => ({ ...m, user_id: USER.id })));
    }
    return json([]);
  });
  await page.addInitScript(
    ({ meals, stored }) => {
      localStorage.setItem('onboarding-seen-local', '1');
      localStorage.setItem('onboarding-seen-chef-1', '1');
      if (stored) localStorage.setItem('sb-stub-auth-token', JSON.stringify(stored));
      else localStorage.setItem('meal-diary-local-meals', JSON.stringify(meals));
    },
    { meals: MEALS, stored: signedIn ? session() : null }
  );
  await page.goto('/');
  await expect(page.locator('.meal-card')).toHaveCount(2);
  return calls;
}

/** Long-presses the first card and confirms Delete in the action sheet. */
async function deleteFromSheet(page) {
  const card = await page.locator('.meal-card').first().boundingBox();
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 3);
  await page.mouse.down();
  const sheet = page.getByRole('dialog', { name: 'Cacio e pepe' });
  await expect(sheet).toBeVisible();
  await page.mouse.up();
  await sheet.getByRole('button', { name: 'Delete dish' }).click();
  await sheet.getByRole('button', { name: 'Delete dish' }).click();
  return sheet;
}

test.describe('deleting a dish', () => {
  test('a signed-in chef’s delete removes it, and asks the server to show what went', async ({ page }) => {
    const calls = await boot(page);
    await deleteFromSheet(page);
    await expect(page.locator('.meal-card')).toHaveCount(1);
    await expect(page.locator('.meal-card')).not.toContainText('Cacio e pepe');
    expect(calls).toHaveLength(1);
    expect(calls[0].search).toContain('id=eq.m2');
    // The deleted row comes back, so an empty answer can be told apart.
    expect(calls[0].prefer).toContain('return=representation');
  });

  test('a delete the server didn’t carry out says so, and the dish stays', async ({ page }) => {
    await boot(page, { deletes: false });
    const sheet = await deleteFromSheet(page);
    await expect(sheet.getByText("Couldn't delete this dish from your account. It's still there.")).toBeVisible();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.meal-card')).toHaveCount(2);
  });

  test('the same from edit mode’s ×, in the edit bar', async ({ page }) => {
    await boot(page, { deletes: false });
    const card = await page.locator('.meal-card').first().boundingBox();
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 3);
    await page.mouse.down();
    await expect(page.getByRole('dialog', { name: 'Cacio e pepe' })).toBeVisible();
    await page.mouse.up();
    await page.getByRole('button', { name: 'Edit gallery' }).click();
    await page.getByRole('button', { name: 'Delete Cacio e pepe' }).click();
    await expect(page.getByRole('alert')).toHaveText("Couldn't delete this dish from your account. It's still there.");
    await expect(page.locator('.meal-card')).toHaveCount(2);
  });

  test('a guest’s delete removes it from this device', async ({ page }) => {
    const calls = await boot(page, { signedIn: false });
    await deleteFromSheet(page);
    await expect(page.locator('.meal-card')).toHaveCount(1);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('meal-diary-local-meals')));
    expect(stored.map((m) => m.id)).toEqual(['m1']);
    expect(calls).toHaveLength(0);
  });
});
