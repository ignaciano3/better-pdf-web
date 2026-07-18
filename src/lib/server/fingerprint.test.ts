import { describe, it, expect } from 'vitest';
import { parseFingerprint } from './fingerprint';

/** Run `fn`, returning the HTTP status of the error it throws (fails if none). */
function thrownStatus(fn: () => unknown): number {
	try {
		fn();
	} catch (e) {
		return (e as { status: number }).status;
	}
	throw new Error('expected parseFingerprint to throw, but it returned');
}

describe('parseFingerprint', () => {
	it('returns the fingerprint for a valid payload', () => {
		expect(parseFingerprint({ fingerprint: 'abc123' })).toBe('abc123');
	});

	it('rejects an empty fingerprint with 422', () => {
		expect(thrownStatus(() => parseFingerprint({ fingerprint: '' }))).toBe(422);
	});

	it('rejects a non-string fingerprint with 422', () => {
		expect(thrownStatus(() => parseFingerprint({ fingerprint: 123 }))).toBe(422);
	});

	it('rejects a null payload with 422', () => {
		expect(thrownStatus(() => parseFingerprint(null))).toBe(422);
	});

	it('rejects an over-long (>256) fingerprint with 422', () => {
		expect(thrownStatus(() => parseFingerprint({ fingerprint: 'x'.repeat(257) }))).toBe(422);
	});
});
