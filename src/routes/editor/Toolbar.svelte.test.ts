import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));

import Toolbar from './Toolbar.svelte';
import { EditorState } from './editor.svelte';

describe('Toolbar', () => {
	it('activates the Text tool when its button is clicked', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });

		await user.click(screen.getByRole('button', { name: 'Text' }));
		flushSync();
		expect(editor.activeDrawKind).toBe('text');
	});

	it('marks the active tool with aria-pressed (non-color cue, #a11y)', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });

		const text = screen.getByRole('button', { name: 'Text' });
		expect(text.getAttribute('aria-pressed')).toBe('false');
		await user.click(text);
		flushSync();
		expect(text.getAttribute('aria-pressed')).toBe('true');
	});

	it('exposes single-key tool shortcuts in tooltips', () => {
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });
		expect(screen.getByRole('button', { name: 'Text' }).getAttribute('title')).toBe('Text (T)');
		expect(screen.getByRole('button', { name: 'Rectangle' }).getAttribute('title')).toBe(
			'Rectangle (R)'
		);
	});

	it('activates the Rect shape tool', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });

		await user.click(screen.getByRole('button', { name: 'Rectangle' }));
		flushSync();
		expect(editor.activeDrawKind).toBe('rectangle');
	});

	it('activates a field tool from the inline Field section (#7)', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });

		// No dropdown to open — the field buttons are visible by default.
		await user.click(screen.getByRole('button', { name: 'Checkbox' }));
		flushSync();
		expect(editor.activeFieldKind).toBe('checkbox');
	});

	it('shows the field tools without a dropdown toggle (#7)', () => {
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });
		expect(screen.queryByRole('button', { name: 'Field ▾' })).toBeNull();
		for (const name of ['Text field', 'Checkbox', 'Radio group', 'Dropdown', 'Signature field']) {
			expect(screen.getByRole('button', { name })).toBeTruthy();
		}
	});

	it('removes the Select button; an active tool toggles back to select (#16)', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });

		expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Line' }));
		flushSync();
		expect(editor.activeDrawKind).toBe('line');
		// Clicking the active tool again returns to the select tool.
		await user.click(screen.getByRole('button', { name: 'Line' }));
		flushSync();
		expect(editor.tool.type).toBe('select');
	});

	it('labels each toolbar section (#16)', () => {
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });
		for (const label of ['Shapes', 'Content', 'Fields']) {
			expect(screen.getByText(label)).toBeTruthy();
		}
	});

	it('closes the Document menu on an outside click (#7)', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });

		await user.click(screen.getByRole('button', { name: 'Document' }));
		flushSync();
		expect(screen.queryByRole('menuitem', { name: 'Properties…' })).not.toBeNull();

		// Pressing a control outside the menu (a shape tool) dismisses it.
		await user.click(screen.getByRole('button', { name: 'Line' }));
		flushSync();
		expect(screen.queryByRole('menuitem', { name: 'Properties…' })).toBeNull();
	});

	it('drops the redundant "Upload sig" control (#11)', () => {
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });
		expect(screen.queryByText('Upload sig')).toBeNull();
	});

	it('groups insert tools into shape and content sections (#12)', () => {
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });
		for (const name of ['Line', 'Rectangle', 'Ellipse', 'Draw', 'Polygon', 'Link']) {
			expect(screen.getByRole('button', { name })).toBeTruthy();
		}
		expect(screen.getByRole('button', { name: 'Text' })).toBeTruthy();
		expect(screen.getByText('Image')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Signature' })).toBeTruthy();
	});

	it('hides the editing controls until a document is ready, keeping only Upload', () => {
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: false } });
		// Upload stays available so the user can get a document in.
		expect(screen.getByText('Upload')).toBeTruthy();
		// Insert tools, Document menu and undo/redo are gone — single focus.
		expect(screen.queryByRole('button', { name: 'Text' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Document' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
		expect(screen.queryByText('Fields')).toBeNull();
	});

	it('opens the document-properties and outline modals from the Document menu', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		render(Toolbar, { props: { editor, onDrawSignature: () => {}, ready: true } });

		await user.click(screen.getByRole('button', { name: 'Document' }));
		flushSync();
		await user.click(screen.getByRole('menuitem', { name: 'Properties…' }));
		flushSync();
		expect(editor.docPropsModalOpen).toBe(true);

		// Selecting an item closes the menu; reopen for the next pick.
		await user.click(screen.getByRole('button', { name: 'Document' }));
		flushSync();
		await user.click(screen.getByRole('menuitem', { name: 'Outline / bookmarks…' }));
		flushSync();
		expect(editor.outlineEditorOpen).toBe(true);
	});
});
