import { describe, it, expect, vi, afterEach } from 'vitest';

// EditorState pulls the export/extract remote graph; the history layer never
// calls them, so mock them out (mirrors editor.svelte.test.ts).
vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));
vi.mock('$lib/pdf/pdf-doc-store', () => {
	class MockPdfDocStore {
		get = vi.fn(async () => ({ destroy: vi.fn() }));
		destroy = vi.fn(async () => {});
		destroyAll = vi.fn(async () => {});
	}
	return { PdfDocStore: MockPdfDocStore };
});

import { EditorState } from './editor.svelte';

// Each editor owns a reactive effect + debounce timer; dispose between tests so
// no stray timer leaks into the next one. flushHistory() is called explicitly in
// the tests to commit a step synchronously, standing in for the debounce.
let editors: EditorState[] = [];
function makeEditor(): EditorState {
	const e = new EditorState();
	editors.push(e);
	return e;
}
afterEach(() => {
	for (const e of editors) e.dispose();
	editors = [];
});

describe('EditorState undo/redo', () => {
	it('starts with empty history', () => {
		const e = makeEditor();
		expect(e.canUndo).toBe(false);
		expect(e.canRedo).toBe(false);
	});

	it('removeSelected deletes the selected element and is undoable (Backspace path)', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		e.flushHistory();
		e.select(e.elements[0]!.id);
		expect(e.selectedId).not.toBeNull();

		e.removeSelected();
		expect(e.elements).toHaveLength(0);
		expect(e.selectedId).toBeNull();

		// The deletion is a normal edit, so undo brings the element back.
		e.flushHistory();
		e.undo();
		expect(e.elements).toHaveLength(1);
	});

	it('removeSelected is a no-op when nothing is selected', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		e.flushHistory();
		e.select(null);
		e.removeSelected();
		expect(e.elements).toHaveLength(1);
	});

	it('records an edit and undoes/redoes it', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		e.flushHistory();
		expect(e.elements).toHaveLength(1);
		expect(e.canUndo).toBe(true);

		e.undo();
		expect(e.elements).toHaveLength(0);
		expect(e.canUndo).toBe(false);
		expect(e.canRedo).toBe(true);

		e.redo();
		expect(e.elements).toHaveLength(1);
		expect(e.canRedo).toBe(false);
	});

	it('steps back through multiple discrete edits in order', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		e.flushHistory();
		e.addTextAt(20, 20, 0);
		e.flushHistory();
		expect(e.elements).toHaveLength(2);

		e.undo();
		expect(e.elements).toHaveLength(1);
		e.undo();
		expect(e.elements).toHaveLength(0);
		expect(e.canUndo).toBe(false);
	});

	it('coalesces edits made before a single commit into one step', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		e.addTextAt(20, 20, 0); // no flush between → same step
		e.flushHistory();
		expect(e.elements).toHaveLength(2);

		e.undo();
		expect(e.elements).toHaveLength(0); // both reverted together
	});

	it('a new edit after undo clears the redo branch', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		e.flushHistory();
		e.undo();
		expect(e.canRedo).toBe(true);

		e.addTextAt(99, 99, 0);
		e.flushHistory();
		expect(e.canRedo).toBe(false);
	});

	it('does not record a step for a selection-only change', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		e.flushHistory();
		const before = e.undoDepth;

		e.select(null);
		e.flushHistory();
		e.select(e.elements[0]!.id);
		e.flushHistory();

		expect(e.undoDepth).toBe(before);
	});

	it('restores the prior selection on undo', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		const firstId = e.elements[0]!.id;
		e.flushHistory();
		e.addTextAt(20, 20, 0);
		e.flushHistory();
		expect(e.selectedId).not.toBe(firstId);

		e.undo(); // back to one element, with that element selected as it was
		expect(e.selectedId).toBe(firstId);
	});

	it('reverts a page operation', () => {
		const e = makeEditor();
		const before = e.pages.length;
		e.insertBlankPage(e.pages.length - 1);
		e.flushHistory();
		expect(e.pageOps.length).toBeGreaterThan(0);

		e.undo();
		expect(e.pages.length).toBe(before);
	});

	it('clearSource resets the timeline', () => {
		const e = makeEditor();
		e.addTextAt(10, 10, 0);
		e.flushHistory();
		expect(e.canUndo).toBe(true);

		e.clearSource();
		expect(e.canUndo).toBe(false);
		expect(e.canRedo).toBe(false);
	});

	it('tracks unsaved work for the persistence warning', () => {
		const e = makeEditor();
		expect(e.hasUnsavedWork).toBe(false); // fresh editor, nothing to lose

		e.addTextAt(10, 10, 0);
		e.flushHistory();
		expect(e.hasUnsavedWork).toBe(true); // an edit exists only in this tab

		e.undo();
		expect(e.hasUnsavedWork).toBe(false); // back to the empty baseline
	});

	it('undo/redo on empty history are safe no-ops', () => {
		const e = makeEditor();
		expect(() => {
			e.undo();
			e.redo();
		}).not.toThrow();
		expect(e.elements).toHaveLength(0);
	});
});
