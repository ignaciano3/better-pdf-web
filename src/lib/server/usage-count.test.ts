import { describe, it, expect } from 'vitest';
import { and, eq, gte, isNull, or } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { windowWhere, EXPORT_ACTION } from './usage-count';
import { usageEvent } from './db/schema.app';
import { windowStart } from './rate-limit';

const since = windowStart(new Date('2026-07-18T12:00:00Z'));

describe('windowWhere', () => {
	it('matches the action constant', () => {
		expect(EXPORT_ACTION).toBe('export');
	});

	it('for a logged-in user matches own userId OR anonymous ipHash events', () => {
		const expected = and(
			eq(usageEvent.action, EXPORT_ACTION),
			or(eq(usageEvent.userId, 'u1'), and(isNull(usageEvent.userId), eq(usageEvent.ipHash, 'h1'))),
			gte(usageEvent.createdAt, since)
		);
		expect(windowWhere('u1', 'h1', since)).toEqual(expected);
	});

	it('for an anonymous actor matches only the anonymous ipHash branch', () => {
		const expected = and(
			eq(usageEvent.action, EXPORT_ACTION),
			and(isNull(usageEvent.userId), eq(usageEvent.ipHash, 'h1')),
			gte(usageEvent.createdAt, since)
		);
		expect(windowWhere(undefined, 'h1', since)).toEqual(expected);
	});

	it('for a logged-in user with no ipHash matches only their own userId', () => {
		const expected = and(
			eq(usageEvent.action, EXPORT_ACTION),
			eq(usageEvent.userId, 'u1'),
			gte(usageEvent.createdAt, since)
		);
		expect(windowWhere('u1', undefined, since)).toEqual(expected);
	});

	it('userId-only actor compiles with no undefined bound params', () => {
		const { params } = new PgDialect().sqlToQuery(windowWhere('u1', undefined, since)!);
		expect(params).not.toContain(undefined);
	});
});
