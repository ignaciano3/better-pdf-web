import { createHash } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import type { IdentityKind } from './rate-limit';

/**
 * Resolved actor for rate limiting. Logged-in users are keyed by `userId`;
 * anonymous callers by `ipHash` (a hash of client IP + browser fingerprint).
 */
export interface Identity {
	kind: IdentityKind;
	/** Set when `kind === 'user'`. */
	userId?: string;
	/** Set when `kind === 'anon'`. */
	ipHash?: string;
	/** Coarse tier label recorded on the usage event. */
	tier: 'anonymous' | 'authenticated';
}

/**
 * Hash an anonymous caller's IP together with a client-supplied fingerprint.
 * The fingerprint disambiguates clients behind a shared NAT/IP; the IP keeps a
 * single forged fingerprint from minting unlimited identities. SHA-256 avoids
 * storing raw IPs at rest.
 */
function hashAnon(ip: string, fingerprint: string): string {
	return createHash('sha256').update(`${ip}|${fingerprint}`).digest('hex');
}

/**
 * Resolve the actor for a request. Prefers the authenticated user from
 * `event.locals`; otherwise hashes the client address with the fingerprint.
 */
export function resolveIdentity(event: RequestEvent, fingerprint: string): Identity {
	const userId = event.locals.user?.id;
	if (userId) {
		return { kind: 'user', userId, tier: 'authenticated' };
	}
	const ip = event.getClientAddress();
	return { kind: 'anon', ipHash: hashAnon(ip, fingerprint), tier: 'anonymous' };
}
