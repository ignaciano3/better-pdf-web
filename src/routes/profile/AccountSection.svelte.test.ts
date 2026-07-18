import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}) }));
vi.mock('$lib/auth-client', () => ({
	authClient: {
		updateUser: vi.fn(async () => ({ error: null })),
		changePassword: vi.fn(async () => ({ error: null }))
	}
}));

import AccountSection from './AccountSection.svelte';

const base = { name: 'Ada', email: 'ada@example.com', emailVerified: true };

describe('AccountSection', () => {
	it('shows the email and a Verified badge when verified', () => {
		const { getByText } = render(AccountSection, { props: { ...base, hasPassword: true } });
		expect(getByText('ada@example.com')).toBeTruthy();
		expect(getByText(/verified/i)).toBeTruthy();
	});

	it('renders the change-password form when hasPassword is true', () => {
		const { getByLabelText } = render(AccountSection, { props: { ...base, hasPassword: true } });
		expect(getByLabelText(/current password/i)).toBeTruthy();
		expect(getByLabelText(/new password/i)).toBeTruthy();
	});

	it('hides change-password and shows the Google note when hasPassword is false', () => {
		const { queryByLabelText, getByText } = render(AccountSection, {
			props: { ...base, hasPassword: false }
		});
		expect(queryByLabelText(/current password/i)).toBeNull();
		expect(getByText(/signed in with google/i)).toBeTruthy();
	});
});
