import type { EditState, FieldElement } from './types';

/** Decision for one export: see the 2026-07-08 incremental-export spec. */
export type ExportPlan =
	| { mode: 'blank' }
	| { mode: 'rebuild'; reason: string }
	| { mode: 'incremental'; newFields: FieldElement[]; valueFills: FieldElement[] };

/**
 * Classify an export as blank / rebuild / incremental. Pure: never parses PDF
 * bytes — page-level guards that need the loaded document (intrinsic /Rotate)
 * are enforced by the builder, which falls back to the rebuild itself.
 */
export function planExport(state: EditState): ExportPlan {
	const sources =
		state.sources && state.sources.length > 0
			? state.sources
			: state.sourcePdf && state.sourcePdf.byteLength > 0
				? [state.sourcePdf]
				: [];
	if (!sources.some((s) => s && s.byteLength > 0)) return { mode: 'blank' };
	if (state.objectStreams) return { mode: 'rebuild', reason: 'compact-structure' };
	for (const op of state.pageOps ?? []) {
		if (op.rotation) return { mode: 'rebuild', reason: 'page-rotation' };
		if (op.kind === 'source' && op.size) return { mode: 'rebuild', reason: 'page-resize' };
	}

	const snapshots = new Map((state.sourceFields ?? []).map((f) => [f.id, f]));
	const seen = new Set<string>();
	const newFields: FieldElement[] = [];
	const valueFills: FieldElement[] = [];
	for (const el of state.elements) {
		if (el.type !== 'field') continue;
		const snap = snapshots.get(el.id);
		if (!snap) {
			newFields.push(el);
			continue;
		}
		seen.add(el.id);
		if (structurallyEqual(el, snap)) {
			if (!valueEqual(el, snap)) valueFills.push(el);
		} else {
			return { mode: 'rebuild', reason: 'source-field-structural-change' };
		}
	}
	for (const id of snapshots.keys()) {
		if (!seen.has(id)) return { mode: 'rebuild', reason: 'source-field-deleted' };
	}
	if (valueFills.length > 0 && sources.length > 1) {
		// assemble may prefix-rename colliding source fields; don't chase renames.
		return { mode: 'rebuild', reason: 'multi-source-value-fill' };
	}
	return { mode: 'incremental', newFields, valueFills };
}

/** Everything except value/selectedValues must match for a source field to stay incremental. */
function structurallyEqual(a: FieldElement, b: FieldElement): boolean {
	return stripValues(a) === stripValues(b);
}

function valueEqual(a: FieldElement, b: FieldElement): boolean {
	return (
		(a.value ?? '') === (b.value ?? '') &&
		JSON.stringify(a.selectedValues ?? []) === JSON.stringify(b.selectedValues ?? [])
	);
}

function stripValues(f: FieldElement): string {
	const { value: _v, selectedValues: _s, ...rest } = f;
	return JSON.stringify(rest, Object.keys(rest).sort());
}
