import { test, expect } from './support/network';

// There's no welcome tour (ADR 0004): a first launch is Home, and Home's
// empty state is what teaches.

async function boot(page, init) {
  await page.route('**stub.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  if (init) await page.addInitScript(init);
  await page.goto('/');
}

test('a first launch lands on Home, which points at Add', async ({ page }) => {
  await boot(page);
  await expect(page.getByRole('heading', { name: 'No dishes yet' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('button', { name: 'Add your first dish' }).click();
  await expect(page.locator('.add-meal-card')).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-current', 'page');
});

test('a guest who finished the old tour still lands on Home', async ({ page }) => {
  // The flags the tour used to leave behind. Nothing reads them now.
  await boot(page, () => {
    localStorage.setItem('onboarding-seen-local', '1');
    localStorage.setItem('onboarding-seen-chef-1', '1');
  });
  await expect(page.getByRole('heading', { name: 'No dishes yet' })).toBeVisible();
});
