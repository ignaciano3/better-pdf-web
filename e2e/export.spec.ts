import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * Set a unique anonymous fingerprint BEFORE the editor's module reads it.
 * The app persists it in localStorage under `bpw:fingerprint`; seeding it here
 * keeps each test's rate-limit bucket isolated from any other run.
 */
async function gotoEditorWithFingerprint(page: Page, fingerprint: string) {
	await page.addInitScript((fp) => {
		localStorage.setItem('bpw:fingerprint', fp);
	}, fingerprint);
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
}

/** Reveal the blank canvas, arm the Text tool, and click to add a "New text" element. */
async function addTextElement(page: Page) {
	// Reveal the canvas from the upload-or-blank empty state, then arm the Text
	// tool — page clicks only create when a draw tool is active.
	const startBlank = page.getByRole('button', { name: 'Start blank' });
	if (await startBlank.isVisible().catch(() => false)) await startBlank.click();
	await page.getByRole('button', { name: 'Text', exact: true }).click();
	const blankPage = page.locator('div.shadow-lg').first();
	await expect(blankPage).toBeVisible();
	// Click near a corner so the click lands on the bare page, not an overlay.
	await blankPage.click({ position: { x: 40, y: 40 } });
	await expect(page.getByText('New text')).toBeVisible();
}

test('upload-less core flow: edit a blank page and export a PDF', async ({ page }) => {
	await gotoEditorWithFingerprint(page, `e2e-core-${randomUUID()}`);
	await addTextElement(page);

	// Export triggers an <a download> with a Blob; capture the download event.
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PDF' }).click();
	const download = await downloadPromise;

	expect(download.suggestedFilename()).toBe('document.pdf');

	// Assert the produced bytes are a real PDF.
	const path = await download.path();
	const fs = await import('node:fs/promises');
	const bytes = await fs.readFile(path);
	expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
});
