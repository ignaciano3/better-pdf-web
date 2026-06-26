import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

async function gotoEditor(page: Page) {
	await page.addInitScript((fp) => localStorage.setItem('bpw:fingerprint', fp), `e2e-zoom-${randomUUID()}`);
	await page.goto('/editor');
	await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible();
}

test('zooming re-rasterises the source page to a larger canvas backing store', async ({ page }) => {
	await gotoEditor(page);

	// 1. Produce a real one-page PDF by exporting a blank page.
	await page.getByRole('button', { name: 'Start blank' }).click();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PDF' }).first().click();
	const pdfPath = await (await downloadPromise).path();
	const pdfBytes = await readFile(pdfPath);

	// 2. Re-open the editor and upload that PDF so a <PdfPageCanvas> renders.
	await gotoEditor(page);
	await page.setInputFiles('input[type="file"]', {
		name: 'doc.pdf',
		mimeType: 'application/pdf',
		buffer: pdfBytes
	});

	const canvas = page.locator('div.shadow-lg canvas').first();
	await expect(canvas).toBeVisible();

	// 3. At fit zoom, the backing store reflects SCALE*zoom*dpr; capture it.
	const widthAtFit = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
	expect(widthAtFit).toBeGreaterThan(0);

	// 4. Zoom to the max (400%) and let the debounced re-render settle.
	const zoomIn = page.getByRole('button', { name: 'Zoom in' });
	for (let i = 0; i < 12; i++) await zoomIn.click(); // step past ZOOM_MAX; clamps to 4
	await page.waitForTimeout(400);

	// 5. The backing store must have grown (re-rasterised, not just CSS-scaled).
	await expect
		.poll(async () => canvas.evaluate((c: HTMLCanvasElement) => c.width), { timeout: 4000 })
		.toBeGreaterThan(widthAtFit);
});
