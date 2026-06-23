import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Rate-limit → upsell flow.
 *
 * Anonymous tier = 2 exports/hour, enforced in Postgres by ip+fingerprint over
 * a 1-hour window. Determinism comes from two layers:
 *   1. `e2e/global-setup.ts` TRUNCATEs `usage_event` before the suite runs.
 *   2. This spec seeds a unique `bpw:fingerprint` per run, so even a non-empty
 *      table (or a shared dev IP) can't carry state into this test.
 * The 3rd export in the window must surface the upsell modal.
 */

async function gotoEditorWithFingerprint(page: Page, fingerprint: string) {
	await page.addInitScript((fp) => {
		localStorage.setItem('bpw:fingerprint', fp);
	}, fingerprint);
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
}

async function addTextElement(page: Page) {
	const blankPage = page.locator('div.shadow-lg').first();
	await expect(blankPage).toBeVisible();
	await blankPage.click({ position: { x: 40, y: 40 } });
	await expect(page.getByText('New text')).toBeVisible();
}

test('third anonymous export hits the cap and shows the upsell modal', async ({ page }) => {
	await gotoEditorWithFingerprint(page, `e2e-rate-${randomUUID()}`);
	await addTextElement(page);

	const exportButton = page.getByRole('button', { name: 'Export PDF' });
	const dialog = page.getByRole('dialog');

	// Exports 1 and 2: allowed → a download fires, no modal.
	for (let attempt = 1; attempt <= 2; attempt++) {
		const downloadPromise = page.waitForEvent('download');
		await exportButton.click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe('document.pdf');
		await expect(dialog).toHaveCount(0);
	}

	// Export 3: over the cap → 429 → upsell modal appears.
	await exportButton.click();
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText(/limit/i);
	await expect(dialog.getByRole('heading', { name: 'Export limit reached' })).toBeVisible();
});
