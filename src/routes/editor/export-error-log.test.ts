import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fake Drizzle client: `insert(table).values(rows)` records each write so
// tests can assert what was persisted. A table may be made to reject to
// simulate a logging failure.
type InsertRecord = { table: unknown; rows: unknown };
let inserts: InsertRecord[];
let rejectInsert: boolean;

vi.mock('$lib/server/db', () => ({
	getDb: () => ({
		insert: (table: unknown) => ({
			values: (rows: unknown) => {
				inserts.push({ table, rows });
				return rejectInsert ? Promise.reject(new Error('db write failed')) : Promise.resolve();
			}
		})
	})
}));

import { recordExportError } from './export-error-log';
import { exportError } from '$lib/server/db/schema.app';

beforeEach(() => {
	inserts = [];
	rejectInsert = false;
});

// The single recorded insert's row, typed for index-signature access.
function loggedRow(): Record<string, unknown> {
	expect(inserts).toHaveLength(1);
	return inserts[0]!.rows as Record<string, unknown>;
}

describe('recordExportError', () => {
	it('inserts metadata with doc-shape folded into the message', async () => {
		await recordExportError(
			{
				name: 'TypeError',
				message: 'boom',
				stack: 'at x',
				pageCount: 3,
				fieldCount: 2,
				stamping: true
			},
			'free',
			{ userId: 'u1' }
		);

		expect(inserts[0]!.table).toBe(exportError);
		const row = loggedRow();
		expect(row).toMatchObject({
			name: 'TypeError',
			tierAtTime: 'free',
			userId: 'u1',
			stack: 'at x'
		});
		expect(row['message']).toBe('boom [pages=3 fields=2 stamping=true]');
		expect(row).not.toHaveProperty('ipHash');
	});

	it('records ipHash (not userId) for an anonymous actor', async () => {
		await recordExportError(
			{ name: 'Error', message: 'x', pageCount: 0, fieldCount: 0, stamping: false },
			'anonymous',
			{ ipHash: 'h1' }
		);

		const row = loggedRow();
		expect(row['ipHash']).toBe('h1');
		expect(row).not.toHaveProperty('userId');
	});

	it('swallows a db write failure and never throws', async () => {
		rejectInsert = true;
		await expect(
			recordExportError(
				{ name: 'Error', message: 'x', pageCount: 0, fieldCount: 0, stamping: false },
				'free',
				{
					userId: 'u1'
				}
			)
		).resolves.toBeUndefined();
		expect(inserts).toHaveLength(1);
	});
});
