import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WINDOW_MS } from './rate-limit';

// Fake Drizzle client shared by both queries usageForActor issues:
//  - countInWindow:  select({value:count()}).from().where()            -> [{ value }]
//  - resetAt oldest: select({createdAt}).from().where().orderBy().limit() -> oldestRows
// `.where()` returns a thenable that resolves to the count rows AND carries
// `.orderBy().limit()` for the oldest-event path.
let countValue: number;
let oldestRows: { createdAt: Date }[];

vi.mock('$lib/server/db', () => ({
	getDb: () => ({
		select: () => ({
			from: () => ({
				where: () => {
					const rows = Promise.resolve([{ value: countValue }]);
					return Object.assign(rows, {
						orderBy: () => ({ limit: () => Promise.resolve(oldestRows) })
					});
				}
			})
		})
	})
}));

import { usageForActor } from './usage-count';

beforeEach(() => {
	countValue = 0;
	oldestRows = [];
});

const now = new Date('2026-07-18T12:30:00.000Z');

describe('usageForActor', () => {
	it('free plan under the cap: finite limit, no resetAt', async () => {
		countValue = 3;
		expect(await usageForActor('u1', undefined, 'free', now)).toEqual({
			used: 3,
			limit: 5,
			resetAt: null
		});
	});

	it('free plan at the cap: resetAt = oldest in-window event + WINDOW_MS', async () => {
		countValue = 5;
		const oldest = new Date('2026-07-18T12:00:00.000Z');
		oldestRows = [{ createdAt: oldest }];
		expect(await usageForActor('u1', 'h1', 'free', now)).toEqual({
			used: 5,
			limit: 5,
			resetAt: new Date(oldest.getTime() + WINDOW_MS).toISOString()
		});
	});

	it('pro plan: unlimited (limit null), never a resetAt', async () => {
		countValue = 42;
		expect(await usageForActor('u1', undefined, 'pro', now)).toEqual({
			used: 42,
			limit: null,
			resetAt: null
		});
	});
});
