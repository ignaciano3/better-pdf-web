import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';

// EditorState imports the export command, which pulls the $app/server + db/auth
// graph. The model layer never calls it in these tests, so mock it out.
vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));
vi.mock('$lib/pdf/pdf-doc-store', () => {
	const getDoc = vi.fn(async () => ({ destroy: vi.fn() }));
	const destroyAll = vi.fn(async () => {});
	class MockPdfDocStore {
		get = getDoc;
		destroy = vi.fn(async () => {});
		destroyAll = destroyAll;
	}
	return {
		PdfDocStore: MockPdfDocStore,
		// expose the spies for assertions
		__getDoc: getDoc,
		__destroyAll: destroyAll
	};
});

import { EditorState } from './editor.svelte';
import { exportPdf } from './export.remote';
import { SELECT_TOOL } from './constants';

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
		}),
		setPointerCapture: () => {}
	} as unknown as HTMLElement;
}

describe('EditorState smoke', () => {
	it('starts empty with nothing selected', () => {
		const e = new EditorState();
		expect(e.elements).toEqual([]);
		expect(e.selected).toBeNull();
	});
});

describe('EditorState tool model', () => {
	it('defaults to the select tool', () => {
		const e = new EditorState();
		expect(e.tool).toEqual(SELECT_TOOL);
		expect(e.activeDrawKind).toBeNull();
	});

	it('select tool never creates on a page click', () => {
		const e = new EditorState();
		e.placeAtClient(40, 40, fakePage(), 0);
		flushSync();
		expect(e.elements).toEqual([]);
	});

	it('text tool creates one text element then resets to select (one-shot)', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'text' });
		expect(e.activeDrawKind).toBe('text');
		e.placeAtClient(40, 80, fakePage(), 0);
		flushSync();
		expect(e.elements.length).toBe(1);
		expect(e.elements[0]?.type).toBe('text');
		expect(e.tool).toEqual(SELECT_TOOL);
	});

	it('places a pending image onto page index 1 (multi-page regression)', () => {
		const e = new EditorState();
		// Simulate a loaded 2-page source so page index 1 is valid.
		e.rendered = [
			{ width: 300, height: 400, dataUrl: 'data:,' },
			{ width: 300, height: 400, dataUrl: 'data:,' }
		];
		e.pageOps = [
			{ kind: 'source', sourceIndex: 0, rotation: 0 },
			{ kind: 'source', sourceIndex: 1, rotation: 0 }
		];
		e.pendingImage = { image: new Uint8Array([1, 2, 3]), format: 'png', aspect: 1 };
		e.setTool({ type: 'draw', kind: 'image' });
		e.placeAtClient(20, 20, fakePage(), 1);
		flushSync();
		expect(e.elements.length).toBe(1);
		expect(e.elements[0]?.type).toBe('image');
		expect(e.elements[0]?.page).toBe(1);
		expect(e.elementsForPage(1).length).toBe(1);
		expect(e.elementsForPage(0).length).toBe(0);
	});
});

describe('EditorState field tools', () => {
	it('field tool creates exactly one FieldElement then resets to select', () => {
		const e = new EditorState();
		e.setTool({ type: 'field', kind: 'text' });
		expect(e.activeFieldKind).toBe('text');
		e.placeAtClient(40, 80, fakePage(), 0);
		flushSync();
		expect(e.elements.length).toBe(1);
		expect(e.elements[0]?.type).toBe('field');
		expect(e.tool).toEqual(SELECT_TOOL);
		expect(e.selectedField?.field).toBe('text');
	});

	it('auto-suggests unique field names per kind', () => {
		const e = new EditorState();
		e.setTool({ type: 'field', kind: 'checkbox' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		e.setTool({ type: 'field', kind: 'checkbox' });
		e.placeAtClient(10, 40, fakePage(), 0);
		flushSync();
		const names = e.elements
			.filter((el) => el.type === 'field')
			.map((el) => (el as { name: string }).name);
		expect(names).toEqual(['checkbox1', 'checkbox2']);
	});

	it('seeds default options for choice/radio fields', () => {
		const e = new EditorState();
		e.setTool({ type: 'field', kind: 'dropdown' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		expect(e.selectedField?.options?.length).toBeGreaterThan(0);
	});

	it('fieldNameTaken detects duplicates ignoring the field itself', () => {
		const e = new EditorState();
		e.setTool({ type: 'field', kind: 'text' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		const f = e.selectedField!;
		expect(e.fieldNameTaken(f.name, f.id)).toBe(false);
		expect(e.fieldNameTaken(f.name, 'other')).toBe(true);
	});

	it('duplicating a field assigns a fresh unique name', () => {
		const e = new EditorState();
		e.setTool({ type: 'field', kind: 'text' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		const original = e.selectedField!.name;
		e.duplicateSelected();
		flushSync();
		expect(e.selectedField!.name).not.toBe(original);
	});
});

describe('EditorState page-bounds clamp (#1)', () => {
	function twoPageEditor() {
		const e = new EditorState();
		// A blank page with an explicit size gives pages[0] = 300×400 directly.
		e.pageOps = [{ kind: 'blank', size: [300, 400], rotation: 0 }];
		return e;
	}

	it('clampToPage keeps a point within [0, w]×[0, h]', () => {
		const e = twoPageEditor();
		expect(e.clampToPage(-50, -10, 0)).toEqual({ x: 0, y: 0 });
		expect(e.clampToPage(999, 999, 0)).toEqual({ x: 300, y: 400 });
		expect(e.clampToPage(120, 80, 0)).toEqual({ x: 120, y: 80 });
	});

	it('clampBox keeps the whole box on the page', () => {
		const e = twoPageEditor();
		// A 100×50 box pushed past the bottom-right snaps so its far edge sits on
		// the page edge: x ≤ 300-100, y ≤ 400-50.
		expect(e.clampBox(999, 999, 100, 50, 0)).toEqual({ x: 200, y: 350 });
		expect(e.clampBox(-5, -5, 100, 50, 0)).toEqual({ x: 0, y: 0 });
	});

	it('placeAtClient clamps an off-page field onto the paper', () => {
		const e = twoPageEditor();
		e.setTool({ type: 'field', kind: 'text' });
		// fakePage maps client→page at cssScale; push way past the bottom-right.
		e.placeAtClient(99999, 99999, fakePage(), 0);
		flushSync();
		const f = e.selectedField!;
		expect(f.x).toBeLessThanOrEqual(300);
		expect(f.y).toBeLessThanOrEqual(400);
		expect(f.x).toBeGreaterThanOrEqual(0);
		expect(f.y).toBeGreaterThanOrEqual(0);
	});
});

describe('EditorState setRasterSize', () => {
	it('sets width/height and clamps to a minimum of 4', () => {
		const e = new EditorState();
		e.rendered = [{ width: 300, height: 400, dataUrl: 'data:,' }];
		e.pageOps = [{ kind: 'source', sourceIndex: 0, rotation: 0 }];
		e.pendingImage = { image: new Uint8Array([1, 2, 3]), format: 'png', aspect: 1 };
		e.setTool({ type: 'draw', kind: 'image' });
		e.placeAtClient(20, 20, fakePage(), 0);
		flushSync();
		const img = e.selectedRaster!;

		e.setRasterSize(img, 120, 80);
		expect(img.width).toBe(120);
		expect(img.height).toBe(80);

		// Below-min and non-finite inputs are guarded.
		e.setRasterSize(img, 1, 0);
		expect(img.width).toBe(4);
		expect(img.height).toBe(4);

		e.setRasterSize(img, Number.NaN, undefined);
		expect(img.width).toBe(4); // unchanged by NaN
	});
});

describe('EditorState addRadioOption', () => {
	it('appends an option and stacks its button below the last (#3)', () => {
		const e = new EditorState();
		e.setTool({ type: 'field', kind: 'radio' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		const f = e.selectedField!;
		const before = f.options!.length;
		const size = Math.min(f.width, f.height);

		e.addRadioOption(f);
		flushSync();

		expect(f.options!.length).toBe(before + 1);
		expect(f.radioLayout!.length).toBe(before + 1);
		const last = f.radioLayout![before - 1]!;
		const added = f.radioLayout![before]!;
		// New button shares x and sits one row (size + 6) below the previous last.
		expect(added.x).toBe(last.x);
		expect(added.y).toBe(last.y + size + 6);
	});
});

describe('EditorState duplicateSelected', () => {
	it('clones the selected element with a new id and offset', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'text' });
		e.placeAtClient(40, 80, fakePage(), 0);
		flushSync();
		const original = e.selected!;
		e.duplicateSelected();
		flushSync();
		expect(e.elements.length).toBe(2);
		expect(e.selected!.id).not.toBe(original.id);
		expect(e.selected!.x).toBe(original.x + 8);
	});
});

function fakePointerDown(): PointerEvent {
	return {
		clientX: 40,
		clientY: 40,
		target: null,
		currentTarget: null,
		preventDefault() {},
		stopPropagation() {}
	} as unknown as PointerEvent;
}

describe('EditorState vector tools', () => {
	it('polygon tool adds vertices on click and stays active until closed', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'polygon' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		e.placeAtClient(60, 10, fakePage(), 0);
		e.placeAtClient(60, 60, fakePage(), 0);
		flushSync();
		// Still drawing: tool not reset, one draft polygon with 3 points.
		expect(e.tool.type).toBe('draw');
		expect(e.polygonDraftId).not.toBeNull();
		const poly = e.elements.find((el) => el.type === 'polygon');
		expect(poly?.type).toBe('polygon');
		expect(poly?.type === 'polygon' && poly.points.length).toBe(3);

		e.closePolygon();
		flushSync();
		expect(e.tool).toEqual(SELECT_TOOL);
		expect(e.polygonDraftId).toBeNull();
		expect(e.elements.filter((el) => el.type === 'polygon').length).toBe(1);
	});

	it('canceling a polygon removes the draft', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'polygon' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		e.cancelPolygon();
		flushSync();
		expect(e.elements.length).toBe(0);
		expect(e.polygonDraftId).toBeNull();
	});

	it('closePolygon discards a polygon with fewer than 2 vertices', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'polygon' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		e.closePolygon();
		flushSync();
		expect(e.elements.filter((el) => el.type === 'polygon').length).toBe(0);
	});

	it('path and link tools do not create on a plain click (drag-based)', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'path' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		e.setTool({ type: 'draw', kind: 'link' });
		e.placeAtClient(10, 10, fakePage(), 0);
		flushSync();
		expect(e.elements.length).toBe(0);
	});

	it('beginFreehandDraw creates a path and resets to select on pointerup', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'path' });
		const handled = e.beginFreehandDraw(fakePointerDown(), fakePage(), 0);
		flushSync();
		expect(handled).toBe(true);
		expect(e.elements[0]?.type).toBe('path');
		window.dispatchEvent(new Event('pointerup'));
		flushSync();
		expect(e.tool).toEqual(SELECT_TOOL);
	});

	it('beginLinkDraw creates a link with an empty url default', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'link' });
		const handled = e.beginLinkDraw(fakePointerDown(), fakePage(), 0);
		flushSync();
		expect(handled).toBe(true);
		expect(e.selectedLink?.url).toBe('');
		window.dispatchEvent(new Event('pointerup'));
		flushSync();
		expect(e.tool).toEqual(SELECT_TOOL);
	});

	it('startDrag translates a polygon’s points by the drag delta', () => {
		const e = new EditorState();
		e.elements = [
			{
				type: 'polygon',
				id: 'pg',
				x: 10,
				y: 10,
				points: [
					{ x: 10, y: 10 },
					{ x: 40, y: 10 },
					{ x: 40, y: 40 }
				]
			}
		];
		const down = { clientX: 0, clientY: 0 } as unknown as PointerEvent;
		e.startDrag(down, e.elements[0]!);
		// Past the 4px threshold so it registers as a drag (delta / SCALE applied).
		window.dispatchEvent(
			new MouseEvent('pointermove', { clientX: 8, clientY: 16 }) as unknown as PointerEvent
		);
		flushSync();
		const poly = e.elements[0];
		expect(poly?.type === 'polygon' && poly.points[0]?.x).toBe(10 + 8 / 0.8);
		expect(poly?.type === 'polygon' && poly.points[0]?.y).toBe(10 + 16 / 0.8);
		window.dispatchEvent(new Event('pointerup'));
	});
});

function dragLine(e: EditorState, from: { x: number; y: number }, to: { x: number; y: number }) {
	e.setTool({ type: 'draw', kind: 'line' });
	const down = {
		clientX: from.x,
		clientY: from.y,
		pointerId: 1,
		preventDefault() {},
		stopPropagation() {}
	} as unknown as PointerEvent;
	e.beginShapeDraw(down, fakePage(), 0);
	window.dispatchEvent(new MouseEvent('pointermove', { clientX: to.x, clientY: to.y }));
	flushSync();
}

describe('EditorState line direction (#1)', () => {
	it('marks a line anti-diagonal when X and Y drag in opposite directions', () => {
		const e = new EditorState();
		// drag up-and-right: cur.x > start.x, cur.y < start.y → anti-diagonal.
		dragLine(e, { x: 40, y: 80 }, { x: 120, y: 20 });
		const sh = e.elements[0];
		expect(sh?.type === 'shape' && sh.antidiagonal).toBe(true);
		window.dispatchEvent(new Event('pointerup'));
	});

	it('leaves a line on the default diagonal when X and Y drag the same way', () => {
		const e = new EditorState();
		// drag down-and-right: both increase → default diagonal.
		dragLine(e, { x: 40, y: 20 }, { x: 120, y: 80 });
		const sh = e.elements[0];
		expect(sh?.type === 'shape' && sh.antidiagonal).toBe(false);
		window.dispatchEvent(new Event('pointerup'));
	});
});

describe('EditorState suppressNextClick (#2)', () => {
	it('suppresses the click after a shape drag so it does not deselect', () => {
		const e = new EditorState();
		dragLine(e, { x: 40, y: 40 }, { x: 120, y: 120 });
		expect(e.suppressNextClick).toBe(false); // not yet released
		window.dispatchEvent(new Event('pointerup'));
		flushSync();
		expect(e.suppressNextClick).toBe(true);
	});

	it('suppresses the click after a link drag', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'link' });
		e.beginLinkDraw(fakePointerDown(), fakePage(), 0);
		window.dispatchEvent(new Event('pointerup'));
		flushSync();
		expect(e.suppressNextClick).toBe(true);
	});

	it('suppresses the click after a freehand path drag', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'path' });
		e.beginFreehandDraw(fakePointerDown(), fakePage(), 0);
		// Two distinct samples so the path survives (single taps are discarded).
		window.dispatchEvent(new MouseEvent('pointermove', { clientX: 80, clientY: 80 }));
		flushSync();
		window.dispatchEvent(new Event('pointerup'));
		flushSync();
		expect(e.suppressNextClick).toBe(true);
	});
});

describe('EditorState add page in blank mode (#3)', () => {
	it('insertBlankPage seeds the implicit page then appends a new one', () => {
		const e = new EditorState();
		expect(e.pageOps.length).toBe(0);
		expect(e.pages.length).toBe(1); // implicit single page
		e.insertBlankPage(e.pages.length - 1);
		flushSync();
		expect(e.pageOps.length).toBe(2);
		expect(e.pages.length).toBe(2);
		expect(e.pageOps.every((op) => op.kind === 'blank')).toBe(true);
	});

	it('keeps existing page-0 elements when adding a page in blank mode', () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'text' });
		e.placeAtClient(20, 20, fakePage(), 0);
		flushSync();
		e.insertBlankPage(e.pages.length - 1);
		flushSync();
		expect(e.elements.length).toBe(1);
		expect(e.elementsForPage(0).length).toBe(1);
	});
});

describe('EditorState duplicatePage', () => {
	it('clones the page op and its elements onto a fresh page, shifting later pages', () => {
		const e = new EditorState();
		e.pageOps = [
			{ kind: 'blank', size: [300, 400], rotation: 90 },
			{ kind: 'blank', size: [500, 500], rotation: 0 }
		];
		e.elements = [
			{ type: 'text', id: 'src-text', text: 'A', x: 1, y: 2, size: 12, page: 0 },
			{
				type: 'field',
				id: 'src-field',
				field: 'text',
				name: 'text1',
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				page: 0
			},
			{ type: 'text', id: 'src-b', text: 'B', x: 3, y: 4, size: 12, page: 1 }
		];
		flushSync();

		e.duplicatePage(0);
		flushSync();

		// The copy is inserted at index 1 (cloned op), pushing page 1 to index 2.
		expect(e.pageOps.length).toBe(3);
		expect(e.pageOps[1]).toEqual({ kind: 'blank', size: [300, 400], rotation: 90 });
		expect(e.elements.find((x) => x.id === 'src-b')?.page).toBe(2);

		// Both page-0 elements are cloned onto the new page 1 with fresh ids.
		const onNew = e.elements.filter((x) => x.page === 1);
		expect(onNew.length).toBe(2);
		expect(onNew.map((x) => x.id)).not.toContain('src-text');
		expect(onNew.map((x) => x.id)).not.toContain('src-field');

		// The cloned field keeps a unique name (not the source's).
		const fieldClone = onNew.find((x) => x.type === 'field');
		expect(fieldClone && fieldClone.type === 'field' ? fieldClone.name : '').not.toBe('text1');
	});
});

describe('EditorState export error reporting (#4)', () => {
	it('surfaces the server error detail and status', async () => {
		vi.mocked(exportPdf).mockRejectedValueOnce({
			status: 422,
			body: { message: 'This PDF is encrypted.' }
		});
		const e = new EditorState();
		await e.export();
		expect(e.errorMessage).toContain('422');
		expect(e.errorMessage).toContain('This PDF is encrypted.');
	});

	it('falls back to a generic message when no detail is present', async () => {
		vi.mocked(exportPdf).mockRejectedValueOnce({});
		const e = new EditorState();
		await e.export();
		expect(e.errorMessage).toBe('Export failed. Please try again.');
	});

	it('routes a 429 to the upsell modal, not the error banner', async () => {
		vi.mocked(exportPdf).mockRejectedValueOnce({ status: 429, body: { message: 'nope' } });
		const e = new EditorState();
		await e.export();
		expect(e.errorMessage).toBeNull();
		expect(e.upsell).not.toBeNull();
	});
});

describe('EditorState fit-to-width (#6)', () => {
	it('fitToWidth solves zoom so one page width fills the usable canvas', () => {
		const e = new EditorState();
		// usable = containerWidth - 64 (canvas padding); zoom = usable / (width * SCALE).
		e.fitToWidth(595.28 * 0.8 + 64);
		flushSync();
		expect(e.zoom).toBeCloseTo(1, 5);
	});
});

describe('EditorState custom fonts', () => {
	it('readFont rejects a non-font file type', async () => {
		const e = new EditorState();
		const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' });
		const asset = await e.readFont(file);
		expect(asset).toBeNull();
		expect(e.errorMessage).toMatch(/ttf|otf/i);
	});

	it('readFont registers a .ttf asset and applyCustomFont sets fontId', async () => {
		const e = new EditorState();
		e.setTool({ type: 'draw', kind: 'text' });
		e.placeAtClient(20, 20, fakePage(), 0);
		flushSync();
		const t = e.selectedText!;
		const file = new File([new Uint8Array([1, 2, 3, 4])], 'My Font.ttf');
		await e.applyCustomFont(file, t);
		flushSync();
		expect(t.fontId).toBeTruthy();
		expect(Object.values(e.embeddedFonts).length).toBe(1);
		expect(Object.values(e.embeddedFonts)[0]?.name).toBe('My Font.ttf');
		e.clearCustomFont(t);
		expect(t.fontId).toBeUndefined();
	});
});

import * as docStoreMod from '$lib/pdf/pdf-doc-store';

describe('EditorState pdf-doc-store wiring', () => {
	it('getPdfDoc rejects when the source bytes are missing', async () => {
		const editor = new EditorState();
		await expect(editor.getPdfDoc(0)).rejects.toThrow();
	});

	it('getPdfDoc asks the store for the doc using the source bytes', async () => {
		const editor = new EditorState();
		const bytes = new Uint8Array([1, 2, 3]);
		editor.sources = [bytes];
		await editor.getPdfDoc(0);
		const getDoc = (docStoreMod as unknown as { __getDoc: ReturnType<typeof vi.fn> }).__getDoc;
		expect(getDoc).toHaveBeenCalledWith(0, bytes);
	});

	it('dispose destroys all cached documents', () => {
		const editor = new EditorState();
		const destroyAll = (docStoreMod as unknown as { __destroyAll: ReturnType<typeof vi.fn> })
			.__destroyAll;
		destroyAll.mockClear();
		editor.dispose();
		expect(destroyAll).toHaveBeenCalled();
	});

	it('clearSource destroys all cached documents', () => {
		const editor = new EditorState();
		const destroyAll = (docStoreMod as unknown as { __destroyAll: ReturnType<typeof vi.fn> })
			.__destroyAll;
		destroyAll.mockClear();
		editor.clearSource();
		expect(destroyAll).toHaveBeenCalled();
	});
});
