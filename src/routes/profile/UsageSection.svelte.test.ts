import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import UsageSection from './UsageSection.svelte';

describe('UsageSection', () => {
	it('shows used / limit for a capped plan', () => {
		const { getByText } = render(UsageSection, {
			props: { used: 3, limit: 5, resetAt: null }
		});
		expect(getByText(/3\s*\/\s*5/)).toBeTruthy();
	});

	it('shows Unlimited when limit is null', () => {
		const { getByText } = render(UsageSection, {
			props: { used: 42, limit: null, resetAt: null }
		});
		expect(getByText(/unlimited/i)).toBeTruthy();
	});

	it('mentions a reset time when capped out', () => {
		const { getByText } = render(UsageSection, {
			props: { used: 5, limit: 5, resetAt: '2026-07-18T13:00:00.000Z' }
		});
		expect(getByText(/resets/i)).toBeTruthy();
	});
});
