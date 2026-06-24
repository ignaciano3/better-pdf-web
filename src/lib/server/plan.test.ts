import { describe, it, expect } from 'vitest';
import { assertPro } from './plan';

describe('assertPro', () => {
	it('returns normally for a pro plan', () => {
		expect(() => assertPro('pro')).not.toThrow();
	});

	it('returns normally for the root plan (outranks pro)', () => {
		expect(() => assertPro('root')).not.toThrow();
	});

	it('throws 402 for a free plan', () => {
		try {
			assertPro('free');
			expect.unreachable('assertPro should have thrown for a non-pro plan');
		} catch (e) {
			// SvelteKit error() throws an object carrying the HTTP status.
			expect((e as { status: number }).status).toBe(402);
		}
	});
});
