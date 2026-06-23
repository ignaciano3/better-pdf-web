import { describe, it, expect } from 'vitest';
import { decide, windowStart, CAPS, WINDOW_MS, UNLIMITED } from './rate-limit';

describe('decide', () => {
	it('allows an anonymous caller below the cap', () => {
		expect(decide('anonymous', 0)).toEqual({ allowed: true, limit: 2, remaining: 1 });
		expect(decide('anonymous', 1)).toEqual({ allowed: true, limit: 2, remaining: 0 });
	});

	it('denies an anonymous caller at the cap', () => {
		expect(decide('anonymous', 2)).toEqual({ allowed: false, limit: 2, remaining: 0 });
	});

	it('denies an anonymous caller over the cap', () => {
		expect(decide('anonymous', 5)).toEqual({ allowed: false, limit: 2, remaining: 0 });
	});

	it('allows a free caller below the cap', () => {
		expect(decide('free', 0)).toEqual({ allowed: true, limit: 5, remaining: 4 });
		expect(decide('free', 4)).toEqual({ allowed: true, limit: 5, remaining: 0 });
	});

	it('denies a free caller at the cap', () => {
		expect(decide('free', 5)).toEqual({ allowed: false, limit: 5, remaining: 0 });
	});

	it('always allows a pro caller (unlimited)', () => {
		expect(decide('pro', 0)).toEqual({ allowed: true, limit: UNLIMITED, remaining: UNLIMITED });
		expect(decide('pro', 5)).toEqual({ allowed: true, limit: UNLIMITED, remaining: UNLIMITED });
		expect(decide('pro', 1_000_000)).toEqual({
			allowed: true,
			limit: UNLIMITED,
			remaining: UNLIMITED
		});
	});

	it('uses the configured caps', () => {
		expect(CAPS.anonymous).toBe(2);
		expect(CAPS.free).toBe(5);
		expect(CAPS.pro).toBe(UNLIMITED);
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
