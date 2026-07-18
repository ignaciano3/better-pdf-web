import { test, expect } from '@playwright/test';

/**
 * Guard: `/profile`'s server load redirects anonymous users (no `locals.user`)
 * to `/login`.
 */
test('anonymous visit to /profile redirects to login', async ({ page }) => {
	await page.goto('/profile');
	await expect(page).toHaveURL(/\/login/);
});
