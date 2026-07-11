import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));

import ZoomControls from './ZoomControls.svelte';
import { EditorState } from './editor.svelte';

describe('ZoomControls', () => {
	it('zoom in / out buttons change zoom', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(ZoomControls, { props: { editor } });

		await user.click(screen.getByRole('button', { name: 'Zoom in' }));
		flushSync();
		expect(editor.zoom).toBeCloseTo(1.25, 5);
		await user.click(screen.getByRole('button', { name: 'Zoom out' }));
		flushSync();
		expect(editor.zoom).toBeCloseTo(1, 5);
	});
});
