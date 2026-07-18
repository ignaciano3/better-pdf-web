import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SubscriptionSection from './SubscriptionSection.svelte';

describe('SubscriptionSection', () => {
	it('free plan shows an Upgrade link to pricing', () => {
		const { getByRole } = render(SubscriptionSection, {
			props: { plan: 'free', status: null, currentPeriodEnd: null, manageUrl: null }
		});
		const link = getByRole('link', { name: /upgrade/i });
		expect(link.getAttribute('href')).toContain('/pricing');
	});

	it('pro plan shows the renewal date and a Manage link', () => {
		const { getByText, getByRole } = render(SubscriptionSection, {
			props: {
				plan: 'pro',
				status: 'active',
				currentPeriodEnd: '2026-08-18T00:00:00.000Z',
				manageUrl: 'https://portal.example.com/x'
			}
		});
		expect(getByText(/renews/i)).toBeTruthy();
		expect(getByRole('link', { name: /manage subscription/i }).getAttribute('href')).toBe(
			'https://portal.example.com/x'
		);
	});

	it('root plan shows a label and no billing controls', () => {
		const { queryByRole, getByText } = render(SubscriptionSection, {
			props: { plan: 'root', status: null, currentPeriodEnd: null, manageUrl: null }
		});
		expect(getByText(/unlimited access/i)).toBeTruthy();
		expect(queryByRole('link', { name: /upgrade|manage/i })).toBeNull();
	});
});
