import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';

vi.mock('$lib/auth-client', () => {
	const revokeOtherSessions = vi.fn(async () => ({ error: null }));
	return { authClient: { revokeOtherSessions } };
});

import SecuritySection from './SecuritySection.svelte';
import { authClient } from '$lib/auth-client';

const revokeOtherSessions = vi.mocked(authClient.revokeOtherSessions);

describe('SecuritySection', () => {
	it('calls revokeOtherSessions when the button is clicked', async () => {
		const { getByRole, getByText } = render(SecuritySection);
		await fireEvent.click(getByRole('button', { name: /sign out of all other devices/i }));
		expect(revokeOtherSessions).toHaveBeenCalledOnce();
		expect(getByText(/signed out other devices/i)).toBeTruthy();
	});
});
