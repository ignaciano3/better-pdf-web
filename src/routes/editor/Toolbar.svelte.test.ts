import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));

import Toolbar from './Toolbar.svelte';
import { EditorState } from './editor.svelte';

describe('Toolbar', () => {
	it('activates the Text tool when its button is clicked', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {} } });

		await user.click(screen.getByRole('button', { name: 'Text' }));
		flushSync();
		expect(editor.activeDrawKind).toBe('text');
	});

	it('activates the Rect shape tool', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {} } });

		await user.click(screen.getByRole('button', { name: 'Rectangle' }));
		flushSync();
		expect(editor.activeDrawKind).toBe('rectangle');
	});

	it('activates a field tool from the Field menu', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {} } });

		await user.click(screen.getByRole('button', { name: 'Field ▾' }));
		flushSync();
		await user.click(screen.getByRole('menuitem', { name: 'Checkbox' }));
		flushSync();
		expect(editor.activeFieldKind).toBe('checkbox');
	});

	it('opens the document-properties and outline modals from the Document menu', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {} } });

		await user.click(screen.getByRole('button', { name: 'Document ▾' }));
		flushSync();
		await user.click(screen.getByRole('menuitem', { name: 'Properties…' }));
		flushSync();
		expect(editor.docPropsModalOpen).toBe(true);

		// Selecting an item closes the menu; reopen for the next pick.
		await user.click(screen.getByRole('button', { name: 'Document ▾' }));
		flushSync();
		await user.click(screen.getByRole('menuitem', { name: 'Outline / bookmarks…' }));
		flushSync();
		expect(editor.outlineEditorOpen).toBe(true);
	});
});
