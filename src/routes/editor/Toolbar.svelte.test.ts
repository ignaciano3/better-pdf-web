import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));

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
});
