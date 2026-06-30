import { describe, it, expect } from 'vitest';
import { countsTowardWindow } from './usage-window';

describe('countsTowardWindow', () => {
	describe('authenticated actor', () => {
		const actor = { userId: 'U', ipHash: 'H' };

		it('counts the actor’s own authenticated events', () => {
			expect(countsTowardWindow({ userId: 'U', ipHash: null }, actor)).toBe(true);
		});

		it('counts pre-signup anonymous events from the same browser/IP (carry-over)', () => {
			// The whole point: 2 anon exports made before signing up still count
			// against the new account's hourly window.
			expect(countsTowardWindow({ userId: null, ipHash: 'H' }, actor)).toBe(true);
		});

		it('ignores another user’s authenticated events', () => {
			expect(countsTowardWindow({ userId: 'U2', ipHash: null }, actor)).toBe(false);
		});

		it('ignores another account’s events even on the same shared browser/IP', () => {
			// Isolation: a different logged-in user on a shared computer must not
			// inherit this actor's budget. Their rows carry a userId, so the
			// anonymous-bridge clause (userId == null) never matches them.
			expect(countsTowardWindow({ userId: 'U2', ipHash: 'H' }, actor)).toBe(false);
		});

		it('ignores anonymous events from a different browser/IP', () => {
			expect(countsTowardWindow({ userId: null, ipHash: 'OTHER' }, actor)).toBe(false);
		});
	});

	describe('anonymous actor', () => {
		const actor = { ipHash: 'H' };

		it('counts anonymous events from the same browser/IP', () => {
			expect(countsTowardWindow({ userId: null, ipHash: 'H' }, actor)).toBe(true);
		});

		it('ignores anonymous events from a different browser/IP', () => {
			expect(countsTowardWindow({ userId: null, ipHash: 'OTHER' }, actor)).toBe(false);
		});

		it('ignores authenticated events that happen to share the browser/IP', () => {
			expect(countsTowardWindow({ userId: 'U', ipHash: 'H' }, actor)).toBe(false);
		});
	});
});
