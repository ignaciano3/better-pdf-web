/**
 * A generic undo/redo timeline over point-in-time snapshots of type `T`.
 *
 * The timeline owns the mechanics — the undo/redo stacks, the committed
 * baseline, the debounced commit, and the reactive stack depths — but knows
 * nothing about the document it is recording. The owner supplies three hooks at
 * the seam:
 *
 *  - `snapshot()` produces a fresh, detached copy of the current document;
 *  - `serialize(snap)` gives a stable string used only to tell whether two
 *    snapshots differ (so a no-op edit isn't recorded as a step);
 *  - `apply(snap)` restores a snapshot onto the live document.
 *
 * This keeps the reactive document state and its tracking effect with the
 * owner, while the timeline stays a plain, unit-testable module: drive it with
 * in-memory hooks and assert on {@link undoDepth} / {@link redoDepth} without a
 * component or a real editor.
 */
export interface TimelineHooks<T> {
	/** Capture the current document as a detached snapshot. */
	snapshot: () => T;
	/** Stable serialization used purely for change detection between snapshots. */
	serialize: (snap: T) => string;
	/** Restore a snapshot onto the live document. */
	apply: (snap: T) => void;
}

export interface TimelineOptions {
	/** Maximum number of undo steps retained; older steps are dropped. */
	limit: number;
	/** Debounce window (ms) that collapses a burst of edits into one step. */
	debounceMs: number;
}

export class HistoryTimeline<T> {
	#hooks: TimelineHooks<T>;
	#limit: number;
	#debounceMs: number;

	#undo: T[] = [];
	#redo: T[] = [];
	/** The document as it currently sits on the timeline. */
	#committed: T;
	#commitTimer: ReturnType<typeof setTimeout> | null = null;

	/** Reactive stack sizes, so toolbar buttons enable/disable live. */
	undoDepth = $state(0);
	redoDepth = $state(0);
	canUndo = $derived(this.undoDepth > 0);
	canRedo = $derived(this.redoDepth > 0);

	constructor(hooks: TimelineHooks<T>, options: TimelineOptions) {
		this.#hooks = hooks;
		this.#limit = options.limit;
		this.#debounceMs = options.debounceMs;
		this.#committed = hooks.snapshot();
	}

	/** Schedule a debounced commit of the current document as one undo step. */
	record(): void {
		if (this.#commitTimer) clearTimeout(this.#commitTimer);
		this.#commitTimer = setTimeout(() => this.flush(), this.#debounceMs);
	}

	/**
	 * Commit any pending edit as a single undo step. Runs on the debounce, and is
	 * called synchronously before undo/redo so an in-flight edit becomes its own
	 * step. A no-op when the document is unchanged from the committed baseline.
	 */
	flush(): void {
		this.#clearTimer();
		const current = this.#hooks.snapshot();
		if (this.#hooks.serialize(current) === this.#hooks.serialize(this.#committed)) return;
		this.#undo.push(this.#committed);
		if (this.#undo.length > this.#limit) this.#undo.shift();
		this.#redo = [];
		this.#committed = current;
		this.#syncDepths();
	}

	undo(): void {
		this.flush();
		const prev = this.#undo.pop();
		if (prev === undefined) return;
		this.#redo.push(this.#committed);
		this.#hooks.apply(prev);
		this.#committed = prev;
		this.#syncDepths();
	}

	redo(): void {
		this.flush();
		const next = this.#redo.pop();
		if (next === undefined) return;
		this.#undo.push(this.#committed);
		this.#hooks.apply(next);
		this.#committed = next;
		this.#syncDepths();
	}

	/**
	 * Reset the timeline to the current document as a fresh baseline. Used when a
	 * whole new document is loaded/cleared, so undo doesn't cross that boundary.
	 */
	reset(): void {
		this.#clearTimer();
		this.#undo = [];
		this.#redo = [];
		this.#committed = this.#hooks.snapshot();
		this.#syncDepths();
	}

	/** Cancel any pending debounced commit. Call on owner teardown. */
	dispose(): void {
		this.#clearTimer();
	}

	#clearTimer(): void {
		if (this.#commitTimer) {
			clearTimeout(this.#commitTimer);
			this.#commitTimer = null;
		}
	}

	#syncDepths(): void {
		this.undoDepth = this.#undo.length;
		this.redoDepth = this.#redo.length;
	}
}
