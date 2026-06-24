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
