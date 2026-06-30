import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the PDF builder but keep a real `PdfBuildError` class so the
// `instanceof` branch in the logger behaves like production. Importing the
// real module would pull in the heavy PDF engine, which the logger never needs.
vi.mock('$lib/pdf/build', () => {
	class PdfBuildError extends Error {
		constructor(message: string) {
			super(message);
			this.name = 'PdfBuildError';
		}
	}
	return { PdfBuildError };
});

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

import { logExportError } from './export-error-log';
import { PdfBuildError } from '$lib/pdf/build';
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

describe('logExportError', () => {
	it('does not log an expected PdfBuildError', async () => {
		await logExportError(new PdfBuildError('bad input pdf'), 'free', { ipHash: 'h' });
		expect(inserts).toHaveLength(0);
	});

	it('logs an unexpected error as metadata into export_error', async () => {
		const boom = new TypeError('cannot read X of undefined');
		await logExportError(boom, 'anonymous', { ipHash: 'ip-hash-test' });

		expect(inserts[0]!.table).toBe(exportError);
		const rows = loggedRow();
		expect(rows).toMatchObject({
			tierAtTime: 'anonymous',
			ipHash: 'ip-hash-test',
			name: 'TypeError',
			message: 'cannot read X of undefined'
		});
		expect(rows['stack']).toBeTruthy();
		// Anonymous actor: no userId column set.
		expect(rows).not.toHaveProperty('userId');
	});

	it('records userId (not ipHash) for a logged-in actor', async () => {
		await logExportError(new Error('boom'), 'pro', { userId: 'user-123' });

		const rows = loggedRow();
		expect(rows['userId']).toBe('user-123');
		expect(rows).not.toHaveProperty('ipHash');
	});

	it('falls back to Error/String() for a non-Error throw', async () => {
		await logExportError('plain string failure', 'free', { ipHash: 'h' });

		expect(loggedRow()).toMatchObject({
			name: 'Error',
			message: 'plain string failure',
			stack: null
		});
	});

	it('swallows a db write failure and never throws', async () => {
		rejectInsert = true;
		await expect(
			logExportError(new Error('original failure'), 'free', { ipHash: 'h' })
		).resolves.toBeUndefined();
		expect(inserts).toHaveLength(1);
	});
});
