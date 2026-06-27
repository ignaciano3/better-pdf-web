import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from './ConfirmDialog.svelte';

const base = {
	open: true,
	title: 'Start a blank document?',
	message: 'Your changes will be discarded.',
	confirmLabel: 'Discard & start blank',
	cancelLabel: 'Keep editing'
};

describe('ConfirmDialog', () => {
	it('renders the title, message and specific button labels', () => {
		render(ConfirmDialog, { props: { ...base, onconfirm: () => {} } });
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByText('Start a blank document?')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Discard & start blank' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
	});

	it('calls onconfirm when the confirm button is clicked', async () => {
		const user = userEvent.setup();
		const onconfirm = vi.fn();
		render(ConfirmDialog, { props: { ...base, onconfirm } });
		await user.click(screen.getByRole('button', { name: 'Discard & start blank' }));
		expect(onconfirm).toHaveBeenCalledOnce();
	});

	it('calls oncancel (not onconfirm) when cancelled', async () => {
		const user = userEvent.setup();
		const onconfirm = vi.fn();
		const oncancel = vi.fn();
		render(ConfirmDialog, { props: { ...base, onconfirm, oncancel } });
		await user.click(screen.getByRole('button', { name: 'Keep editing' }));
		expect(oncancel).toHaveBeenCalledOnce();
		expect(onconfirm).not.toHaveBeenCalled();
	});

	it('does not render when closed', () => {
		render(ConfirmDialog, { props: { ...base, open: false, onconfirm: () => {} } });
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});
