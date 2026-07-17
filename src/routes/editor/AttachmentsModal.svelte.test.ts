import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

vi.mock('./gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));

import AttachmentsModal from './AttachmentsModal.svelte';
import { EditorState } from './editor.svelte';

it('lists attachments and removes one', async () => {
	const editor = new EditorState();
	await editor.addAttachment(new File(['x'], 'report.xml', { type: 'text/xml' }));
	editor.attachmentsModalOpen = true;

	render(AttachmentsModal, { editor });
	expect(screen.getByText('report.xml')).toBeTruthy();

	await userEvent.click(screen.getByRole('button', { name: /remove report\.xml/i }));
	expect(editor.attachments).toHaveLength(0);
});

it('is hidden when closed', () => {
	const editor = new EditorState();
	render(AttachmentsModal, { editor });
	expect(screen.queryByText(/attachments/i)).toBeNull();
});
