import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';

// EditorState imports the export command, which pulls the $app/server + db/auth
// graph. The model layer never calls it in these tests, so mock it out.
vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));

import { EditorState } from './editor.svelte';
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
		})
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
