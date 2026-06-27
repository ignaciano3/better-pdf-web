import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('../export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('../extractFields.remote', () => ({ extractFields: vi.fn() }));


import ShapeOverlay from './ShapeOverlay.svelte';
import { EditorState } from '../editor.svelte';
import type { ShapeElement } from '$lib/pdf/types';

function shape(extra: Partial<ShapeElement> = {}): ShapeElement {
	return {
		type: 'shape',
		id: 'sh',
		shape: 'rectangle',
		x: 0,
		y: 0,
		width: 100,
		height: 80,
		...extra
	};
}

// SCALE = 0.8: dash points scale to canvas px like strokeWidth.
describe('ShapeOverlay live preview', () => {
	it('reflects a dashed stroke, scaling dash lengths/phase by SCALE', () => {
		const editor = new EditorState();
		const { container } = render(ShapeOverlay, {
			props: { el: shape({ dash: [4, 2], dashPhase: 1 }), editor }
		});
		const rect = container.querySelector('rect') as SVGRectElement;
		expect(rect.getAttribute('stroke-dasharray')).toBe('3.2 1.6');
		expect(rect.getAttribute('stroke-dashoffset')).toBe('0.8');
	});

	it('renders a solid stroke (no dasharray) when dash is unset', () => {
		const editor = new EditorState();
		const { container } = render(ShapeOverlay, { props: { el: shape(), editor } });
		const rect = container.querySelector('rect') as SVGRectElement;
		expect(rect.getAttribute('stroke-dasharray')).toBeNull();
	});

	it('reflects dash on line shapes', () => {
		const editor = new EditorState();
		const { container } = render(ShapeOverlay, {
			props: { el: shape({ shape: 'line', dash: [5] }), editor }
		});
		const line = container.querySelector('line') as SVGLineElement;
		expect(line.getAttribute('stroke-dasharray')).toBe('4');
	});

	// On touch devices a drag on the element must move it, not scroll the page.
	// Without touch-action:none the browser claims the gesture and fires
	// pointercancel, abandoning the drag (regression: mobile deselect).
	it('marks the draggable box and resize handle as touch-action:none', () => {
		const editor = new EditorState();
		editor.selectedId = 'sh';
		const { container } = render(ShapeOverlay, { props: { el: shape(), editor } });
		const box = container.querySelector('.cursor-move') as HTMLElement;
		expect(box.classList.contains('touch-none')).toBe(true);
		const handle = container.querySelector('.cursor-nwse-resize') as HTMLElement;
		expect(handle.classList.contains('touch-none')).toBe(true);
	});
});
