import { describe, it, expect } from 'vitest';
import { planOperation } from './operation-intent';

describe('planOperation', () => {
	it('maps `new` to a blank start without the picker', () => {
		expect(planOperation('new')).toEqual({ startBlank: true, openPicker: false, intent: null });
	});

	it('maps picker-only operations with no post-load intent', () => {
		for (const op of ['upload', 'fill', 'edit']) {
			expect(planOperation(op)).toEqual({ startBlank: false, openPicker: true, intent: null });
		}
	});

	it('maps intent operations to picker + matching intent', () => {
		for (const op of ['merge', 'split', 'sign', 'watermark'] as const) {
			expect(planOperation(op)).toEqual({ startBlank: false, openPicker: true, intent: op });
		}
	});

	it('ignores unknown and missing operations', () => {
		expect(planOperation(null)).toEqual({ startBlank: false, openPicker: false, intent: null });
		expect(planOperation('bogus')).toEqual({ startBlank: false, openPicker: false, intent: null });
	});
});
