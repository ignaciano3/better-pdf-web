import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));

import FloatingToolbar from './FloatingToolbar.svelte';
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

describe('FloatingToolbar', () => {
	it('shows nothing when there is no selection', () => {
		const editor = new EditorState();
		render(FloatingToolbar, { props: { editor } });
		expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
	});

	it('deletes the selected element', async () => {
		const user = userEvent.setup();
		const editor = new EditorState();
		editor.setTool({ type: 'draw', kind: 'text' });
		editor.placeAtClient(40, 80, fakePage(), 0);
		flushSync();
		render(FloatingToolbar, { props: { editor } });
		await user.click(screen.getByRole('button', { name: 'Delete' }));
		flushSync();
		expect(editor.elements.length).toBe(0);
	});
});
