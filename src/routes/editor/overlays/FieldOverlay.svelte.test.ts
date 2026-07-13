import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('../gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));

import FieldOverlay from './FieldOverlay.svelte';
import { EditorState } from '../editor.svelte';
import type { FieldElement } from '$lib/pdf/types';

function field(extra: Partial<FieldElement> = {}): FieldElement {
	return {
		type: 'field',
		id: 'f',
		field: 'text',
		name: 'f',
		x: 0,
		y: 0,
		width: 120,
		height: 24,
		...extra
	};
}

// SCALE = 0.8.
describe('FieldOverlay live preview', () => {
	it('reflects align and fontSize on text value fields (fontSize scaled by SCALE)', () => {
		const editor = new EditorState();
		const { container } = render(FieldOverlay, {
			props: { el: field({ align: 'center', fontSize: 20 }), editor }
		});
		const input = container.querySelector('input[type="text"]') as HTMLInputElement;
		expect(input.style.textAlign).toBe('center');
		expect(input.style.fontSize).toBe('16px');
	});

	it('shows the chosen checkbox mark glyph only when the box is on', () => {
		const editor = new EditorState();
		const on = render(FieldOverlay, {
			props: { el: field({ field: 'checkbox', checkStyle: 'cross', value: 'Yes' }), editor }
		});
		expect((on.container.querySelector('button') as HTMLButtonElement).textContent?.trim()).toBe(
			'✗'
		);

		const off = render(FieldOverlay, {
			props: { el: field({ id: 'g', field: 'checkbox', checkStyle: 'cross', value: '' }), editor }
		});
		expect((off.container.querySelector('button') as HTMLButtonElement).textContent?.trim()).toBe(
			''
		);
	});

	it('shows the radio mark glyph on the selected option only', () => {
		const editor = new EditorState();
		const { container } = render(FieldOverlay, {
			props: {
				el: field({ field: 'radio', options: ['A', 'B'], checkStyle: 'star', value: 'A' }),
				editor
			}
		});
		// Exactly one option (the selected 'A') renders the star.
		expect((container.textContent?.match(/★/g) ?? []).length).toBe(1);
	});
});
