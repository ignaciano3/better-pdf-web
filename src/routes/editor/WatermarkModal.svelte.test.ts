import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));

import WatermarkModal from './WatermarkModal.svelte';
import { EditorState } from './editor.svelte';

function openModal() {
	const editor = new EditorState();
	editor.watermarkModalOpen = true;
	flushSync();
	return editor;
}

describe('WatermarkModal', () => {
	it('adds a default watermark', async () => {
		const user = userEvent.setup();
		const editor = openModal();
		render(WatermarkModal, { props: { editor } });
		await user.click(screen.getByRole('button', { name: 'Add watermark' }));
		flushSync();
		expect(editor.watermark?.text).toBe('DRAFT');
	});

	it('removes the watermark', async () => {
		const user = userEvent.setup();
		const editor = openModal();
		editor.watermark = { text: 'DRAFT' };
		flushSync();
		render(WatermarkModal, { props: { editor } });
		await user.click(screen.getByRole('button', { name: 'Remove' }));
		flushSync();
		expect(editor.watermark).toBeNull();
	});

	it('reflects an image watermark and switches back to text', async () => {
		const user = userEvent.setup();
		const editor = openModal();
		editor.watermark = {
			text: '',
			image: new Uint8Array([1, 2, 3]),
			format: 'png',
			imageWidth: 240,
			imageHeight: 120
		};
		flushSync();
		render(WatermarkModal, { props: { editor } });

		// Image mode exposes the width slider, not the text field.
		expect(screen.getByRole('slider', { name: 'Watermark image width' })).toBeTruthy();
		expect(screen.queryByRole('textbox')).toBeNull();

		// Switching to Text drops the image bytes and restores default text.
		await user.click(screen.getByRole('button', { name: 'Text' }));
		flushSync();
		expect(editor.watermark?.image).toBeUndefined();
		expect(editor.watermark?.text).toBe('DRAFT');
	});
});
