import { PdfBuildError } from '$lib/pdf/build';
import { getDb } from '$lib/server/db';
import { exportError } from '$lib/server/db/schema.app';
import type { Tier } from '$lib/server/rate-limit';

/**
 * Actor behind a failed export, identified the same way as `usageEvent`:
 * `userId` (logged-in) and/or `ipHash` (anonymous).
 */
export type ExportErrorActor = { userId?: string; ipHash?: string };

/**
 * Persist an unexpected export failure as metadata only — no document content.
 *
 * A `PdfBuildError` is an expected bad-input rejection (surfaced to the client
 * as a 422), not a server bug, so it is never logged. Logging is best-effort:
 * this never throws, so a failed write can't mask the original export error.
 */
export async function logExportError(
	e: unknown,
	tier: Tier,
	actor: ExportErrorActor
): Promise<void> {
	if (e instanceof PdfBuildError) return;
	try {
		const err = e instanceof Error ? e : undefined;
		await getDb()
			.insert(exportError)
			.values({
				id: crypto.randomUUID(),
				tierAtTime: tier,
				name: err?.name ?? 'Error',
				message: err?.message ?? String(e),
				stack: err?.stack ?? null,
				...(actor.userId ? { userId: actor.userId } : {}),
				...(actor.ipHash ? { ipHash: actor.ipHash } : {})
			});
	} catch {
		// Best-effort: swallow so the original export error still propagates.
	}
}
