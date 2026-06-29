import { describe, it, expect, vi } from 'vitest';
import { HistoryTimeline, type TimelineOptions } from './editor-history.svelte';

/**
 * The timeline's seam is three hooks over an opaque snapshot type — so it can be
 * exercised with a plain in-memory document and no editor, no components, no
 * Svelte runtime. `live` stands in for the document; `set` mutates it.
 */
interface Doc {
	v: number;
}

function harness(initial = 0, opts: TimelineOptions = { limit: 100, debounceMs: 10 }) {
	let live: Doc = { v: initial };
	const timeline = new HistoryTimeline<Doc>(
		{
			snapshot: () => ({ ...live }),
			serialize: (s) => JSON.stringify(s),
			apply: (s) => {
				live = { ...s };
			}
		},
		opts
	);
	return {
		timeline,
		set: (v: number) => {
			live.v = v;
		},
		get value() {
			return live.v;
		}
	};
}

describe('HistoryTimeline', () => {
	it('starts empty', () => {
		const h = harness();
		expect(h.timeline.canUndo).toBe(false);
		expect(h.timeline.canRedo).toBe(false);
		expect(h.timeline.undoDepth).toBe(0);
	});

	it('commits an edit and undoes it', () => {
		const h = harness(0);
		h.set(1);
		h.timeline.flush();
		expect(h.timeline.undoDepth).toBe(1);
		expect(h.timeline.canUndo).toBe(true);

		h.timeline.undo();
		expect(h.value).toBe(0);
		expect(h.timeline.canUndo).toBe(false);
		expect(h.timeline.canRedo).toBe(true);

		h.timeline.redo();
		expect(h.value).toBe(1);
		expect(h.timeline.canRedo).toBe(false);
	});

	it('does not record a step when nothing changed', () => {
		const h = harness(0);
		h.timeline.flush();
		h.timeline.flush();
		expect(h.timeline.undoDepth).toBe(0);
	});

	it('clears the redo stack on a fresh edit', () => {
		const h = harness(0);
		h.set(1);
		h.timeline.flush();
		h.timeline.undo();
		expect(h.timeline.canRedo).toBe(true);

		h.set(2);
		h.timeline.flush();
		expect(h.timeline.canRedo).toBe(false);
		expect(h.timeline.undoDepth).toBe(1);
	});

	it('caps the undo stack at the configured limit', () => {
		const h = harness(0, { limit: 3, debounceMs: 10 });
		for (let i = 1; i <= 6; i++) {
			h.set(i);
			h.timeline.flush();
		}
		expect(h.timeline.undoDepth).toBe(3);
	});

	it('reset drops history and rebaselines on the current document', () => {
		const h = harness(0);
		h.set(1);
		h.timeline.flush();
		h.set(2);
		h.timeline.reset();
		expect(h.timeline.undoDepth).toBe(0);
		expect(h.timeline.canRedo).toBe(false);
		// The current value is the new baseline; an undo has nothing to restore.
		h.timeline.undo();
		expect(h.value).toBe(2);
	});

	it('record() debounces a commit', () => {
		vi.useFakeTimers();
		try {
			const h = harness(0, { limit: 100, debounceMs: 10 });
			h.set(1);
			h.timeline.record();
			expect(h.timeline.undoDepth).toBe(0); // not yet committed
			vi.advanceTimersByTime(10);
			expect(h.timeline.undoDepth).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('dispose() cancels a pending commit', () => {
		vi.useFakeTimers();
		try {
			const h = harness(0, { limit: 100, debounceMs: 10 });
			h.set(1);
			h.timeline.record();
			h.timeline.dispose();
			vi.advanceTimersByTime(50);
			expect(h.timeline.undoDepth).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});
