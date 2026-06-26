import { test, expect } from '@playwright/test';

/**
 * Regression: typing into a text element must keep characters in order.
 *
 * The overlay used to render its value via a reactive `{text.text}` child while
 * also writing `innerText` back on every `oninput`. That reset the caret to
 * offset 0 each keystroke, so "hello" came out "olleh". The overlay now renders
 * the text imperatively and never writes back into the focused element.
 */
test('typing text is not reversed', async ({ page }) => {
	await page.goto('/editor');
	await page.getByRole('button', { name: 'Start blank' }).click();
	await page.getByRole('button', { name: 'Text', exact: true }).click();

	const blankPage = page.locator('div.shadow-lg').first();
	await expect(blankPage).toBeVisible();
	await blankPage.click({ position: { x: 60, y: 60 } });

	// Target the live editable box specifically: the Pages thumbnail renders an
	// inert preview copy with `contenteditable="false"` that precedes it in the
	// DOM, so a bare `[contenteditable]` would match the wrong (inert) element.
	const editable = page.locator('[contenteditable="plaintext-only"]').first();
	await editable.click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.press('Delete');
	await page.keyboard.type('hello', { delay: 50 });

	await expect(editable).toHaveText('hello');
});
