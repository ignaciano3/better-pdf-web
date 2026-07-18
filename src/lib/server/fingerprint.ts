import { error } from '@sveltejs/kit';

/** Max accepted fingerprint length (mirrors the export gate's own limit). */
const MAX_FINGERPRINT_LEN = 256;

/**
 * Extract and validate the client fingerprint from a remote-function payload.
 * Throws HTTP 422 for a missing, empty, non-string, or over-long value. Keeps
 * the profile usage query's validation in lockstep with the export gate.
 */
export function parseFingerprint(input: unknown): string {
	const fingerprint = (input as { fingerprint?: unknown } | null)?.fingerprint;
	if (
		typeof fingerprint !== 'string' ||
		fingerprint.length === 0 ||
		fingerprint.length > MAX_FINGERPRINT_LEN
	) {
		error(422, 'Invalid fingerprint');
	}
	return fingerprint;
}
