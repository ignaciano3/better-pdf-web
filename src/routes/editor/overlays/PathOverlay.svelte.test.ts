import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('../export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('../extractFields.remote', () => ({ extractFields: vi.fn() }));

import PathOverlay from './PathOverlay.svelte';
import { EditorState } from '../editor.svelte';
import type { PathElement } from '$lib/pdf/types';

function path(extra: Partial<PathElement> = {}): PathElement {
	return {
		type: 'path',
		id: 'p',
		x: 0,
		y: 0,
		points: [
			{ x: 0, y: 0 },
			{ x: 50, y: 50 }
		],
		...extra
	};
}

// SCALE = 0.8.
describe('PathOverlay live preview', () => {
	it('reflects a dashed stroke scaled by SCALE', () => {
		const editor = new EditorState();
		const { container } = render(PathOverlay, {
			props: { el: path({ dash: [4, 2], dashPhase: 1 }), editor }
		});
		const el = container.querySelector('path') as SVGPathElement;
		expect(el.getAttribute('stroke-dasharray')).toBe('3.2 1.6');
		expect(el.getAttribute('stroke-dashoffset')).toBe('0.8');
	});

	it('renders solid when dash is unset', () => {
		const editor = new EditorState();
		const { container } = render(PathOverlay, { props: { el: path(), editor } });
		const el = container.querySelector('path') as SVGPathElement;
		expect(el.getAttribute('stroke-dasharray')).toBeNull();
	});
});
