import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('../export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('../extractFields.remote', () => ({ extractFields: vi.fn() }));

import PolygonOverlay from './PolygonOverlay.svelte';
import { EditorState } from '../editor.svelte';
import type { PolygonElement } from '$lib/pdf/types';

function polygon(extra: Partial<PolygonElement> = {}): PolygonElement {
	return {
		type: 'polygon',
		id: 'pg',
		x: 0,
		y: 0,
		closed: true,
		points: [
			{ x: 0, y: 0 },
			{ x: 50, y: 0 },
			{ x: 25, y: 40 }
		],
		...extra
	};
}

// SCALE = 0.8.
describe('PolygonOverlay live preview', () => {
	it('reflects a dashed stroke scaled by SCALE on the closed polygon', () => {
		const editor = new EditorState();
		const { container } = render(PolygonOverlay, {
			props: { el: polygon({ dash: [4, 2], dashPhase: 1 }), editor }
		});
		const el = container.querySelector('polygon') as SVGPolygonElement;
		expect(el.getAttribute('stroke-dasharray')).toBe('3.2 1.6');
		expect(el.getAttribute('stroke-dashoffset')).toBe('0.8');
	});

	it('renders solid when dash is unset', () => {
		const editor = new EditorState();
		const { container } = render(PolygonOverlay, { props: { el: polygon(), editor } });
		const el = container.querySelector('polygon') as SVGPolygonElement;
		expect(el.getAttribute('stroke-dasharray')).toBeNull();
	});
});
