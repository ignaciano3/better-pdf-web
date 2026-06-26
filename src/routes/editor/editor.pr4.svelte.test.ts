import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));
// Render the source PDF to a couple of fake pages without touching pdf.js.
vi.mock('$lib/pdf/render', async (orig) => {
	const actual = (await orig()) as object;
	return {
		...actual,
		renderSourcePdf: vi.fn(async () => [
			{ width: 612, height: 792, dataUrl: 'data:image/png;base64,AAAA' },
			{ width: 612, height: 792, dataUrl: 'data:image/png;base64,BBBB' }
		])
	};
});

import { EditorState } from './editor.svelte';
import { SCALE } from './constants';

function fakePage(): HTMLElement {
	return {
		getBoundingClientRect: () => ({
			left: 0,
			top: 0,
			right: 240,
			bottom: 320,
			width: 240,
			height: 320,
			x: 0,
			y: 0,
			toJSON() {}
		})
	} as unknown as HTMLElement;
}

function pdfFile(name = 'doc.pdf'): File {
	return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' });
}

describe('EditorState zoom', () => {
	it('defaults to zoom 1 with cssScale = SCALE', () => {
		const e = new EditorState();
		expect(e.zoom).toBe(1);
		expect(e.cssScale).toBe(SCALE);
	});

	it('clamps zoom to [0.25, 4]', () => {
		const e = new EditorState();
		e.setZoom(10);
		expect(e.zoom).toBe(4);
		e.setZoom(0.01);
		expect(e.zoom).toBe(0.25);
	});

	it('placeAtClient divides by cssScale (zoom != 1)', () => {
		const e = new EditorState();
		e.setZoom(2);
		e.setTool({ type: 'draw', kind: 'text' });
		// Click at 80px with cssScale = SCALE*2 = 1.6 → point = 80 / 1.6 = 50.
		e.placeAtClient(80, 160, fakePage(), 0);
		flushSync();
		const el = e.elements[0];
		expect(el?.x).toBeCloseTo(80 / (SCALE * 2), 5);
		expect(el?.y).toBeCloseTo(160 / (SCALE * 2), 5);
	});
});

describe('EditorState page size override', () => {
	it('setPageSize sets a size override on a source page op', async () => {
		const e = new EditorState();
		await e.loadPdf(pdfFile());
		flushSync();
		expect(e.pageOps.length).toBe(2);
		e.setPageSize(0, [612, 792]);
		const op = e.pageOps[0];
		expect(op?.kind === 'source' && op.size).toEqual([612, 792]);
	});

	it('setAllPageSizes applies an override to every page', async () => {
		const e = new EditorState();
		await e.loadPdf(pdfFile());
		flushSync();
		e.setAllPageSizes([595.28, 841.89]);
		for (const op of e.pageOps) {
			expect(op.kind === 'source' && op.size).toEqual([595.28, 841.89]);
		}
	});

	it('pageContentBox returns the source render size by default', async () => {
		const e = new EditorState();
		await e.loadPdf(pdfFile());
		flushSync();
		expect(e.pageContentBox(0)).toEqual({ width: 612, height: 792 });
	});

	it('pageContentBox follows the size override so the preview matches export', async () => {
		const e = new EditorState();
		await e.loadPdf(pdfFile());
		flushSync();
		e.setPageSize(0, [300, 900]);
		// The background image must fill the override box, not stay at 612x792.
		expect(e.pageContentBox(0)).toEqual({ width: 300, height: 900 });
	});

	it('pageContentBox is the un-rotated box even when the page is rotated', async () => {
		const e = new EditorState();
		await e.loadPdf(pdfFile());
		flushSync();
		e.setPageSize(0, [300, 900]);
		e.rotatePage(0); // 90°: pages[] swaps to 900x300, but the content box stays 300x900.
		expect(e.pageContentBox(0)).toEqual({ width: 300, height: 900 });
	});
});

describe('EditorState merge / appendPdf', () => {
	it('appends a second PDF, growing pages and tagging ops with docIndex 1', async () => {
		const e = new EditorState();
		await e.loadPdf(pdfFile('first.pdf'));
		flushSync();
		expect(e.pageOps.length).toBe(2);

		await e.appendPdf(pdfFile('second.pdf'));
		flushSync();

		// 2 + 2 = 4 output pages.
		expect(e.pageOps.length).toBe(4);
		expect(e.pages.length).toBe(4);
		const appended = e.pageOps.slice(2);
		for (const op of appended) {
			expect(op.kind === 'source' && op.docIndex).toBe(1);
		}
		// Both source documents are tracked.
		expect(e.sources.length).toBe(2);
	});

	it('appendPdf on a blank editor seeds doc 0', async () => {
		const e = new EditorState();
		await e.appendPdf(pdfFile('only.pdf'));
		flushSync();
		expect(e.pageOps.length).toBe(2);
		expect(e.sources.length).toBe(1);
	});

	it('keeps placed content on its own blank page when merging into a blank editor', async () => {
		const e = new EditorState();
		// Place a field on the implicit blank page 0.
		e.placeFieldAt('text', 50, 50, 0);
		flushSync();
		const fieldId = e.elements[0]?.id;
		expect(fieldId).toBeTruthy();

		await e.appendPdf(pdfFile('incoming.pdf'));
		flushSync();

		// The implicit blank page is materialized and kept first; the 2 incoming
		// pages follow → 3 output pages.
		expect(e.pageOps.length).toBe(3);
		expect(e.pageOps[0]?.kind).toBe('blank');
		expect(e.pageOps[1]?.kind === 'source' && e.pageOps[1]?.docIndex).toBe(0);
		// The field still lives on page 0 (the blank), not the incoming PDF.
		const field = e.elements.find((el) => el.id === fieldId);
		expect(field?.page ?? 0).toBe(0);
	});
});

describe('EditorState metadata + outline', () => {
	it('holds metadata and outline state', () => {
		const e = new EditorState();
		e.metadata = { title: 'Hi' };
		e.outline = [{ title: 'Root', page: 0 }];
		expect(e.metadata.title).toBe('Hi');
		expect(e.outline.length).toBe(1);
	});
});
