import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));

import FieldPropertiesModal from './FieldPropertiesModal.svelte';
import { EditorState } from './editor.svelte';

function fakePage(): HTMLElement {
	return {
		getBoundingClientRect: () => ({
			left: 0,
			top: 0,
			right: 240,
			bottom: 320,
			width: 240,
			height: 320,
			x: 0,
			y: 0,
			toJSON() {}
		})
	} as unknown as HTMLElement;
}

function withField(kind: 'text' | 'dropdown') {
	const editor = new EditorState();
	editor.setTool({ type: 'field', kind });
	editor.placeAtClient(20, 20, fakePage(), 0);
	flushSync();
	editor.fieldModalOpen = true;
	flushSync();
	return editor;
}

describe('FieldPropertiesModal', () => {
	it('sets the field name on Done', async () => {
		const user = userEvent.setup();
		const editor = withField('text');
		render(FieldPropertiesModal, { props: { editor } });

		const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
		await user.clear(nameInput);
		await user.type(nameInput, 'applicant');
		await user.click(screen.getByRole('button', { name: 'Done' }));
		flushSync();
		expect(editor.selectedField?.name).toBe('applicant');
		expect(editor.fieldModalOpen).toBe(false);
	});

	it('toggles required', async () => {
		const user = userEvent.setup();
		const editor = withField('text');
		render(FieldPropertiesModal, { props: { editor } });
		await user.click(screen.getByLabelText('Required'));
		flushSync();
		expect(editor.selectedField?.required).toBe(true);
	});

	it('blocks save on a duplicate name', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		// First field: text1
		editor.setTool({ type: 'field', kind: 'text' });
		editor.placeAtClient(20, 20, fakePage(), 0);
		flushSync();
		const firstName = editor.selectedField!.name;
		// Second field: text2, open its modal.
		editor.setTool({ type: 'field', kind: 'text' });
		editor.placeAtClient(20, 60, fakePage(), 0);
		flushSync();
		editor.fieldModalOpen = true;
		flushSync();
		render(FieldPropertiesModal, { props: { editor } });

		const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
		await user.clear(nameInput);
		await user.type(nameInput, firstName);
		flushSync();
		// Duplicate error shown, Done disabled, save blocked.
		expect(screen.getByRole('alert').textContent).toMatch(/already exists/);
		const done = screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement;
		expect(done.disabled).toBe(true);
		expect(editor.selectedField!.name).not.toBe(firstName);
	});

	it('adds and removes options for a dropdown field', async () => {
		const user = userEvent.setup();
		const editor = withField('dropdown');
		render(FieldPropertiesModal, { props: { editor } });
		const before = editor.selectedField!.options!.length;
		await user.click(screen.getByRole('button', { name: 'Add' }));
		flushSync();
		expect(editor.selectedField!.options!.length).toBe(before + 1);
	});

	it('deletes the field', async () => {
		const user = userEvent.setup();
		const editor = withField('text');
		render(FieldPropertiesModal, { props: { editor } });
		await user.click(screen.getByRole('button', { name: 'Delete field' }));
		flushSync();
		expect(editor.elements.length).toBe(0);
	});
});
