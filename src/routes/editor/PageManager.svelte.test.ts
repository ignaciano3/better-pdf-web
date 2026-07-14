import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

vi.mock('./gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));
vi.mock('$lib/pdf/pdf-doc-store', () => {
	class MockPdfDocStore {
		get = vi.fn(async () => ({ destroy: vi.fn() }));
		destroy = vi.fn(async () => {});
		destroyAll = vi.fn(async () => {});
	}
	return { PdfDocStore: MockPdfDocStore };
});

import PageManager from './PageManager.svelte';
import { EditorState } from './editor.svelte';

describe('PageManager accessibility', () => {
	it('gives every page control a descriptive accessible name (not just an icon)', () => {
		const editor = new EditorState(); // one default blank page
		render(PageManager, { props: { editor } });

		// Icon-only controls expose intent + which page to screen readers.
		expect(screen.getByRole('button', { name: 'Move page 1 up' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Move page 1 down' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Rotate page 1 90 degrees' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Insert blank page after page 1' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Duplicate page 1' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Delete page 1' })).toBeTruthy();
		// The new-page size select has an accessible label, not just a title.
		expect(screen.getByRole('combobox', { name: 'Size for new blank pages' })).toBeTruthy();
	});

	it('disables move-up and delete for a single page', () => {
		const editor = new EditorState();
		render(PageManager, { props: { editor } });
		const up = screen.getByRole('button', { name: 'Move page 1 up' }) as HTMLButtonElement;
		const del = screen.getByRole('button', { name: 'Delete page 1' }) as HTMLButtonElement;
		expect(up.disabled).toBe(true);
		expect(del.disabled).toBe(true);
	});
});

describe('PageManager navigation', () => {
	it('clicking a page thumbnail navigates the canvas to that page', async () => {
		const editor = new EditorState();
		editor.insertBlankPage(0); // now two pages
		const spy = vi.spyOn(editor, 'scrollToPage');
		render(PageManager, { props: { editor } });

		await fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
		expect(spy).toHaveBeenCalledWith(1);
	});
});

describe('PageManager per-page resize', () => {
	it('reflects the page size and overrides one page on change', async () => {
		const editor = new EditorState();
		editor.pageOps = [{ kind: 'blank', size: [300, 400], rotation: 0 }];
		render(PageManager, { props: { editor } });

		const select = screen.getByRole('combobox', { name: 'Resize page 1' }) as HTMLSelectElement;
		// Unknown 300×400 size reflects as the disabled "Custom size" placeholder.
		expect(select.value).toBe('custom');

		// Picking Letter landscape overrides only this page's content box (swapped).
		await fireEvent.change(select, { target: { value: 'Letter|l' } });
		expect(editor.pageContentBox(0)).toEqual({ width: 792, height: 612 });
	});
});
