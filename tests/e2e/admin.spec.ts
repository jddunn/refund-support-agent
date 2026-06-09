import { test, expect } from '@playwright/test';

/**
 * Admin surface: the auth gate (middleware) + the three staff pages. No model
 * key needed; these pages read from the trace store / policy fixtures. The
 * test admin password (`admin`) is set by the webServer env in
 * playwright.config.ts.
 */
test.describe('admin auth gate', () => {
  test('an unauthenticated admin route redirects to login', async ({ page }) => {
    await page.goto('/admin/traces');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Admin login' })).toBeVisible();
  });

  test('a wrong password is rejected and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#password').fill('not-the-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Target the error text directly; Next also renders an empty
    // role="alert" route-announcer, so an unscoped alert role is ambiguous.
    await expect(page.getByText('Incorrect password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the correct password unlocks every admin surface', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#password').fill('admin');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Login lands on the traces page (the run log).
    await expect(page).toHaveURL(/\/admin\/traces$/);
    await expect(page.getByRole('heading', { name: 'Runs' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Refund Agent · Admin/i })).toBeVisible();

    const adminNav = page.getByRole('navigation', { name: 'Admin' });

    // Playground exposes the model selector that the consumer chat hides.
    await adminNav.getByRole('link', { name: 'Playground' }).click();
    await expect(page).toHaveURL(/\/admin\/playground$/);
    await expect(page.locator('#model')).toBeVisible();

    // Policy renders the written policy + the red-team results section.
    await adminNav.getByRole('link', { name: 'Policy' }).click();
    await expect(page).toHaveURL(/\/admin\/policy$/);
    await expect(page.getByRole('heading', { name: 'Red-team results' })).toBeVisible();
  });

  test('logging out drops back to the gate', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#password').fill('admin');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin\/traces$/);

    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The session is really gone: the gate redirects again.
    await page.goto('/admin/traces');
    await expect(page).toHaveURL(/\/login$/);
  });
});
