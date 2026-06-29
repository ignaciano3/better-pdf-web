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

function withField(kind: 'text' | 'dropdown' | 'checkbox' | 'listbox') {
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

	it('toggles password for a text field', async () => {
		const user = userEvent.setup();
		const editor = withField('text');
		render(FieldPropertiesModal, { props: { editor } });
		await user.click(screen.getByLabelText('Password'));
		flushSync();
		expect(editor.selectedField?.password).toBe(true);
	});

	it('sets a text reset default distinct from the initial value', async () => {
		const user = userEvent.setup();
		const editor = withField('text');
		render(FieldPropertiesModal, { props: { editor } });
		await user.type(screen.getByLabelText('Initial value'), 'hi');
		await user.type(screen.getByLabelText('Reset default'), 'bye');
		flushSync();
		expect(editor.selectedField?.value).toBe('hi');
		expect(editor.selectedField?.defaultValue).toBe('bye');
	});

	it('sets defaultChecked for a checkbox', async () => {
		const user = userEvent.setup();
		const editor = withField('checkbox');
		render(FieldPropertiesModal, { props: { editor } });
		await user.click(screen.getByLabelText('Checked by default'));
		flushSync();
		expect(editor.selectedField?.defaultChecked).toBe(true);
	});

	it('toggles multi-select for a listbox and edits selected values', async () => {
		const user = userEvent.setup();
		const editor = withField('listbox');
		editor.selectedField!.options = ['a', 'b', 'c'];
		flushSync();
		render(FieldPropertiesModal, { props: { editor } });

		await user.click(screen.getByLabelText('Multi-select'));
		flushSync();
		expect(editor.selectedField?.multiSelect).toBe(true);

		await user.click(screen.getByLabelText('a'));
		await user.click(screen.getByLabelText('b'));
		flushSync();
		expect(editor.selectedField?.selectedValues).toEqual(['a', 'b']);
	});

	it('clears selectedValues when multi-select is turned off', async () => {
		const user = userEvent.setup();
		const editor = withField('listbox');
		editor.selectedField!.options = ['a', 'b'];
		editor.selectedField!.multiSelect = true;
		editor.selectedField!.selectedValues = ['a'];
		flushSync();
		render(FieldPropertiesModal, { props: { editor } });

		await user.click(screen.getByLabelText('Multi-select'));
		flushSync();
		expect(editor.selectedField?.multiSelect).toBeUndefined();
		expect(editor.selectedField?.selectedValues).toBeUndefined();
	});

	it('drops a stale single value when multi-select is turned on', async () => {
		const user = userEvent.setup();
		const editor = withField('listbox');
		editor.selectedField!.options = ['a', 'b'];
		editor.selectedField!.value = 'a';
		flushSync();
		render(FieldPropertiesModal, { props: { editor } });

		await user.click(screen.getByLabelText('Multi-select'));
		flushSync();
		expect(editor.selectedField?.multiSelect).toBe(true);
		expect(editor.selectedField?.value).toBeUndefined();
	});
});
