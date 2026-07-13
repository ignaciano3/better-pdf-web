import { getDb } from '$lib/server/db';
import { exportError } from '$lib/server/db/schema.app';
import type { Tier } from '$lib/server/rate-limit';

/** Actor behind a failed export, identified like `usageEvent`. */
export type ExportErrorActor = { userId?: string; ipHash?: string };

/** Client-classified failure metadata. Never carries document content. */
export interface ExportErrorDetails {
	name: string;
	message: string;
	stack?: string;
	pageCount: number;
	fieldCount: number;
	stamping: boolean;
}

/**
 * Persist an unexpected client build failure as metadata only. The client has
 * already filtered out expected `PdfBuildError`s (bad input), so anything that
 * reaches here is a genuine bug. Doc shape is folded into `message` (the table
 * has no shape columns). Best-effort: never throws.
 */
export async function recordExportError(
	details: ExportErrorDetails,
	tier: Tier,
	actor: ExportErrorActor
): Promise<void> {
	try {
		const message = `${details.message} [pages=${details.pageCount} fields=${details.fieldCount} stamping=${details.stamping}]`;
		await getDb()
			.insert(exportError)
			.values({
				id: crypto.randomUUID(),
				tierAtTime: tier,
				name: details.name || 'Error',
				message,
				stack: details.stack ?? null,
				...(actor.userId ? { userId: actor.userId } : { ipHash: actor.ipHash })
			});
	} catch {
		// Best-effort: swallow so a logging failure never masks the export error.
	}
}
