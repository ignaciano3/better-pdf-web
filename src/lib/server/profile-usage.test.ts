import { describe, it, expect } from 'vitest';
import { usageView } from './profile-usage';

describe('usageView', () => {
	it('free plan reports the finite cap', () => {
		expect(usageView('free', 3)).toEqual({ used: 3, limit: 5 });
	});

	it('pro plan reports no limit (null)', () => {
		expect(usageView('pro', 42)).toEqual({ used: 42, limit: null });
	});

	it('root plan reports no limit (null)', () => {
		expect(usageView('root', 0)).toEqual({ used: 0, limit: null });
	});
});
