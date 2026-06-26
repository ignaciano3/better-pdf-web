import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));

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
});
