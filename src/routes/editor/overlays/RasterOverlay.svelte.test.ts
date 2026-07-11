import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('../export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('../extractFields.remote', () => ({ extractFields: vi.fn() }));
vi.mock('../gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));

import RasterOverlay from './RasterOverlay.svelte';
import { EditorState } from '../editor.svelte';
import type { ImageElement } from '$lib/pdf/types';

// jsdom has no Blob URL factory; rasterUrl() only needs a string back.
beforeAll(() => {
	if (!URL.createObjectURL)
		URL.createObjectURL = vi.fn(() => 'blob:test') as typeof URL.createObjectURL;
});

function image(extra: Partial<ImageElement> = {}): ImageElement {
	return {
		type: 'image',
		id: 'img',
		x: 10,
		y: 20,
		width: 100,
		height: 50,
		image: new Uint8Array([1, 2, 3]),
		format: 'png',
		...extra
	};
}

describe('RasterOverlay live preview', () => {
	it('reflects opacity, rotate and skew, mirroring the export transform', () => {
		const editor = new EditorState();
		const { container } = render(RasterOverlay, {
			props: { el: image({ opacity: 0.5, rotate: 30, xSkew: 10, ySkew: 5 }), editor }
		});
		const img = container.querySelector('img') as HTMLImageElement;
		expect(img.style.opacity).toBe('0.5');
		// Export rotate/skew are CCW; CSS is CW, so the preview negates them.
		expect(img.style.transform).toContain('rotate(-30deg)');
		expect(img.style.transform).toContain('skewX(-10deg)');
		expect(img.style.transform).toContain('skewY(-5deg)');
		// Anchor matches the PDF placement point (bottom-left of the box).
		expect(img.style.transformOrigin).toBe('left bottom');
	});

	it('defaults to opaque and untransformed when props are unset', () => {
		const editor = new EditorState();
		const { container } = render(RasterOverlay, { props: { el: image(), editor } });
		const img = container.querySelector('img') as HTMLImageElement;
		expect(img.style.opacity).toBe('1');
		expect(img.style.transform).toBe('');
	});
});
