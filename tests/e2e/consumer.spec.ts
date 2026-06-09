import { test, expect } from '@playwright/test';

/**
 * Consumer surface: the public landing + customer chat. The chat send flow
 * route-mocks `POST /api/chat` so the agent's response is deterministic and no
 * model key is needed — this floor tests the UI/routing/integration layer; the
 * real agent is covered by the stress + live-smoke harnesses.
 */
test.describe('consumer', () => {
  test('landing page renders and links into the app', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Refund Support Agent/i);
    await expect(page.getByRole('heading', { name: 'Refund Support Agent' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Customer chat/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Admin/i })).toBeVisible();

    await page.getByRole('link', { name: /Customer chat/i }).click();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('chat shows the customer picker + empty hint and hides the model selector', async ({
    page,
  }) => {
    await page.goto('/chat');
    await expect(page.getByLabel('Acting as')).toBeVisible();
    await expect(page.getByText(/Ask for a refund/i)).toBeVisible();
    // Consumers run AUTO with no model control — that selector is admin-only.
    await expect(page.locator('#model')).toHaveCount(0);
  });

  test('sending a message renders the agent decision (api mocked)', async ({ page }) => {
    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Your refund for ORD-58120 has been approved.',
          decision: 'approve',
          runId: 'run-e2e-1',
          citations: ['§3.1'],
        }),
      });
    });

    await page.goto('/chat');
    await page.getByLabel('Message').fill('Please refund my order ORD-58120');
    await page.getByRole('button', { name: 'Send' }).click();

    // The customer's own message is echoed into the log.
    await expect(page.getByText('Please refund my order ORD-58120')).toBeVisible();
    // The mocked agent reply, decision badge, citation, and trace link all render.
    await expect(page.getByText('Your refund for ORD-58120 has been approved.')).toBeVisible();
    await expect(page.getByText('approve', { exact: true })).toBeVisible();
    await expect(page.getByText('Policy: §3.1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'view trace' })).toBeVisible();
  });

  test('send is disabled until the customer types something', async ({ page }) => {
    await page.goto('/chat');
    const send = page.getByRole('button', { name: 'Send' });
    await expect(send).toBeDisabled();
    await page.getByLabel('Message').fill('hello');
    await expect(send).toBeEnabled();
  });
});
