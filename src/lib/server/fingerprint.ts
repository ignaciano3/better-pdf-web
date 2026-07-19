import { error } from '@sveltejs/kit';

/** Max accepted fingerprint length. */
const MAX_FINGERPRINT_LEN = 256;

/**
 * Extract and validate the client fingerprint from a remote-function payload.
 * Throws HTTP 422 for a missing, empty, non-string, or over-long value. Shared
 * by the export gate (`checkExportAllowance`) and the profile usage query
 * (`getProfileUsage`) so their fingerprint validation can't drift.
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
