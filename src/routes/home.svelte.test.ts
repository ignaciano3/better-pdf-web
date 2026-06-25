import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

import Page from './+page.svelte';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('home health check (#10)', () => {
	it('shows the status inline instead of navigating away', () => {
		render(Page);
		const btn = screen.getByRole('button', { name: 'Health check' });
		// It's a button (no href), so clicking never navigates.
		expect(btn.tagName).toBe('BUTTON');
	});

	it('reports OK when the endpoint is healthy', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ status: 'ok', db: 'reachable' }), { status: 200 }))
		);
		const user = userEvent.setup();
		render(Page);
		await user.click(screen.getByRole('button', { name: 'Health check' }));
		flushSync();
		expect(await screen.findByText(/App OK/i)).toBeTruthy();
	});

	it('reports unhealthy when the endpoint errors', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ status: 'error', db: 'unreachable' }), { status: 503 }))
		);
		const user = userEvent.setup();
		render(Page);
		await user.click(screen.getByRole('button', { name: 'Health check' }));
		flushSync();
		expect(await screen.findByText(/App unhealthy/i)).toBeTruthy();
	});
});
