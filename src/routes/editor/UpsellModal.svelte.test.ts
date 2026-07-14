import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('./gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));

import UpsellModal from './UpsellModal.svelte';
import { EditorState } from './editor.svelte';

describe('UpsellModal reset time', () => {
	it('tells the user when they can export again when retryAt is known', () => {
		const editor = new EditorState();
		editor.upsell = { limit: 5, window: 60 * 60 * 1000, retryAt: Date.now() + 15 * 60 * 1000 };
		const { container } = render(UpsellModal, { props: { editor, signedIn: false } });

		const text = container.textContent ?? '';
		expect(text).toContain('you can export again');
		expect(text).toMatch(/in about 15 minutes/);
		// The generic fallback phrasing is replaced.
		expect(text).not.toContain('try again later');
	});

	it('falls back to generic copy when no retryAt is present', () => {
		const editor = new EditorState();
		editor.upsell = { limit: 5, window: 60 * 60 * 1000 };
		const { container } = render(UpsellModal, { props: { editor, signedIn: false } });

		expect(container.textContent ?? '').toContain('try again later');
	});
});
