import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';

const { getProfileUsage } = vi.hoisted(() => ({
	getProfileUsage: vi.fn(async () => ({ used: 5, limit: 5, resetAt: null }))
}));
vi.mock('./usage.remote', () => ({ getProfileUsage }));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('$lib/auth-client', () => ({
	authClient: {
		updateUser: vi.fn(async () => ({ error: null })),
		changePassword: vi.fn(async () => ({ error: null })),
		revokeOtherSessions: vi.fn(async () => ({ error: null }))
	}
}));

import Page from './+page.svelte';

const data = {
	// Merged in from the root +layout.server.ts load — required by PageData
	// even though +page.svelte itself never reads these.
	user: {
		id: 'user-1',
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
		email: 'ada@example.com',
		emailVerified: true,
		name: 'Ada'
	},
	isRoot: false,
	manageUrl: null,
	email: 'ada@example.com',
	name: 'Ada',
	emailVerified: true,
	plan: 'free' as const,
	hasPassword: true,
	subscription: { status: null, currentPeriodEnd: null, manageUrl: null },
	usage: { used: 3, limit: 5, resetAt: null }
};

beforeEach(() => {
	localStorage.clear();
	getProfileUsage.mockClear();
});

describe('profile page — usage refinement', () => {
	it('refines the SSR own-only count to the combined count using the fingerprint', async () => {
		localStorage.setItem('bpw:fingerprint', 'fp-123');
		const { getByText, findByText } = render(Page, { props: { data } });
		// SSR own-only value renders first.
		expect(getByText(/3\s*\/\s*5/)).toBeTruthy();
		// Then the client refines to the combined count.
		expect(await findByText(/5\s*\/\s*5/)).toBeTruthy();
		expect(getProfileUsage).toHaveBeenCalledWith({ fingerprint: 'fp-123' });
	});

	it('keeps the SSR value and does not query when no fingerprint is stored', async () => {
		const { getByText } = render(Page, { props: { data } });
		expect(getByText(/3\s*\/\s*5/)).toBeTruthy();
		expect(getProfileUsage).not.toHaveBeenCalled();
	});
});
