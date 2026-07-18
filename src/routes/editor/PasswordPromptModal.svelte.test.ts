import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import PasswordPromptModal from './PasswordPromptModal.svelte';

function editorWith(over: Partial<Record<string, unknown>> = {}) {
	return {
		passwordPrompt: { wrongPassword: false, resolve: vi.fn(), reject: vi.fn() },
		...over
	} as never;
}

describe('PasswordPromptModal', () => {
	it('renders nothing when passwordPrompt is null', () => {
		render(PasswordPromptModal, { editor: editorWith({ passwordPrompt: null }) });
		expect(screen.queryByText(/password/i)).toBeNull();
	});

	it('resolves with the typed password on Unlock', async () => {
		const resolve = vi.fn();
		const editor = editorWith({
			passwordPrompt: { wrongPassword: false, resolve, reject: vi.fn() }
		});
		render(PasswordPromptModal, { editor });
		await userEvent.type(screen.getByLabelText(/password/i), 'secret');
		await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
		expect(resolve).toHaveBeenCalledWith('secret');
	});

	it('rejects on Cancel', async () => {
		const reject = vi.fn();
		const editor = editorWith({
			passwordPrompt: { wrongPassword: false, resolve: vi.fn(), reject }
		});
		render(PasswordPromptModal, { editor });
		await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
		expect(reject).toHaveBeenCalled();
	});

	it('shows an error line when wrongPassword is true', () => {
		render(PasswordPromptModal, {
			editor: editorWith({
				passwordPrompt: { wrongPassword: true, resolve: vi.fn(), reject: vi.fn() }
			})
		});
		expect(screen.getByText(/incorrect password/i)).toBeTruthy();
	});
});
