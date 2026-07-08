import { describe, it, expect } from 'vitest';
import { planExport } from './export-plan';
import type { EditState, FieldElement } from './types';

function field(over: Partial<FieldElement> & Pick<FieldElement, 'field' | 'name'>): FieldElement {
	return {
		type: 'field',
		id: over.name,
		x: 20,
		y: 20,
		width: 120,
		height: 22,
		page: 0,
		...over
	};
}

const SRC = new Uint8Array([1, 2, 3]); // classifier never parses bytes

function base(over: Partial<EditState> = {}): EditState {
	return { pageSize: [400, 500], elements: [], sources: [SRC], ...over };
}

describe('planExport', () => {
	it('no sources → blank', () => {
		expect(planExport({ pageSize: [400, 500], elements: [] })).toEqual({ mode: 'blank' });
	});

	it('objectStreams on → rebuild', () => {
		const plan = planExport(base({ objectStreams: true }));
		expect(plan.mode).toBe('rebuild');
	});

	it('rotation/size page ops → rebuild', () => {
		const rot = planExport(
			base({ pageOps: [{ kind: 'source', sourceIndex: 0, rotation: 90, docIndex: 0 }] })
		);
		expect(rot.mode).toBe('rebuild');
		const sized = planExport(
			base({
				pageOps: [{ kind: 'source', sourceIndex: 0, rotation: 0, docIndex: 0, size: [300, 300] }]
			})
		);
		expect(sized.mode).toBe('rebuild');
	});

	it('new fields only → incremental with newFields', () => {
		const f = field({ field: 'text', name: 'nnew1' });
		const plan = planExport(base({ elements: [f] }));
		expect(plan).toEqual({ mode: 'incremental', newFields: [f], valueFills: [] });
	});

	it('unchanged source field → skipped (neither authored nor filled)', () => {
		const snap = field({ field: 'text', name: 'orig', value: 'a' });
		const plan = planExport(base({ elements: [snap], sourceFields: [snap] }));
		expect(plan).toEqual({ mode: 'incremental', newFields: [], valueFills: [] });
	});

	it('value-only change on source field → valueFills', () => {
		const snap = field({ field: 'text', name: 'orig', value: 'a' });
		const edited = { ...snap, value: 'b' };
		const plan = planExport(base({ elements: [edited], sourceFields: [snap] }));
		expect(plan).toEqual({ mode: 'incremental', newFields: [], valueFills: [edited] });
	});

	it('structural change on source field → rebuild', () => {
		const snap = field({ field: 'text', name: 'orig' });
		const moved = { ...snap, x: 99 };
		expect(planExport(base({ elements: [moved], sourceFields: [snap] })).mode).toBe('rebuild');
		const renamed = { ...snap, name: 'other' };
		expect(planExport(base({ elements: [renamed], sourceFields: [snap] })).mode).toBe('rebuild');
	});

	it('deleted source field → rebuild', () => {
		const snap = field({ field: 'text', name: 'orig' });
		expect(planExport(base({ elements: [], sourceFields: [snap] })).mode).toBe('rebuild');
	});

	it('multi-source with a source-field value change → rebuild', () => {
		const snap = field({ field: 'text', name: 'orig', value: 'a' });
		const edited = { ...snap, value: 'b' };
		const plan = planExport(
			base({ sources: [SRC, SRC], elements: [edited], sourceFields: [snap] })
		);
		expect(plan.mode).toBe('rebuild');
	});
});
