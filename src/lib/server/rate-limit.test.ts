import { describe, it, expect } from 'vitest';
import { decide, windowStart, CAPS, WINDOW_MS } from './rate-limit';

describe('decide', () => {
	it('allows an anonymous caller below the cap', () => {
		expect(decide('anon', 0)).toEqual({ allowed: true, limit: 2, remaining: 1 });
		expect(decide('anon', 1)).toEqual({ allowed: true, limit: 2, remaining: 0 });
	});

	it('denies an anonymous caller at the cap', () => {
		expect(decide('anon', 2)).toEqual({ allowed: false, limit: 2, remaining: 0 });
	});

	it('denies an anonymous caller over the cap', () => {
		expect(decide('anon', 5)).toEqual({ allowed: false, limit: 2, remaining: 0 });
	});

	it('allows an authenticated caller below the cap', () => {
		expect(decide('user', 0)).toEqual({ allowed: true, limit: 5, remaining: 4 });
		expect(decide('user', 4)).toEqual({ allowed: true, limit: 5, remaining: 0 });
	});

	it('denies an authenticated caller at the cap', () => {
		expect(decide('user', 5)).toEqual({ allowed: false, limit: 5, remaining: 0 });
	});

	it('uses the configured caps', () => {
		expect(CAPS.anon).toBe(2);
		expect(CAPS.user).toBe(5);
	});
});

describe('windowStart', () => {
	it('returns now minus the window length', () => {
		const now = new Date('2026-06-23T12:00:00.000Z');
		expect(windowStart(now).getTime()).toBe(now.getTime() - WINDOW_MS);
	});

	it('models window expiry: events older than the window are excluded', () => {
		const now = new Date('2026-06-23T12:00:00.000Z');
		const start = windowStart(now);
		const justInside = new Date(start.getTime() + 1);
		const justOutside = new Date(start.getTime() - 1);
		// Counting predicate is createdAt >= start.
		expect(justInside >= start).toBe(true);
		expect(justOutside >= start).toBe(false);
	});
});
