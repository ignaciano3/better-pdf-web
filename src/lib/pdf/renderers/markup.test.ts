import { describe, it, expect } from 'vitest';
import { renderMarkup } from './markup';
import type { RenderContext } from './types';
import type { MarkupElement } from '../types';

type RectCall = {
	x: number;
	y: number;
	width: number;
	height: number;
	fill?: [number, number, number] | { toString(): string };
	stroke?: unknown;
	opacity?: number;
};
type LineCall = {
	start: { x: number; y: number };
	end: { x: number; y: number };
	strokeWidth?: number;
	opacity?: number;
};

/** Capture the draw calls a markup element makes into a stub PdfPage. */
function capture(element: MarkupElement, pageHeight: number) {
	let rect: RectCall | null = null;
	let line: LineCall | null = null;
	const page = {
		drawRectangle: (a: RectCall) => (rect = a),
		drawLine: (a: LineCall) => (line = a)
	};
	renderMarkup({ page, pageHeight } as unknown as RenderContext, element);
	return { rect: rect as RectCall | null, line: line as LineCall | null };
}

function markup(overrides: Partial<MarkupElement> = {}): MarkupElement {
	return {
		type: 'markup',
		id: 'm',
		markup: 'highlight',
		x: 50,
		y: 80,
		width: 120,
		height: 20,
		color: { r: 1, g: 1, b: 0 },
		...overrides
	};
}

describe('renderMarkup', () => {
	const H = 800; // pageHeight; bottom = H - y - height

	it('highlight fills the whole box at the flipped-Y bottom, with opacity', () => {
		const { rect } = capture(markup({ opacity: 0.4 }), H);
		expect(rect).not.toBeNull();
		expect(rect!.x).toBe(50);
		expect(rect!.y).toBe(700); // 800 - 80 - 20
		expect(rect!.width).toBe(120);
		expect(rect!.height).toBe(20);
		expect(rect!.opacity).toBe(0.4);
		expect(rect!.fill).toBeDefined();
		expect(rect!.stroke).toBeUndefined();
	});

	it('highlight defaults opacity to 0.4 when unset', () => {
		const { rect } = capture(markup(), H);
		expect(rect!.opacity).toBe(0.4);
	});

	it('underline draws a line along the box bottom edge', () => {
		const { line } = capture(markup({ markup: 'underline', thickness: 2 }), H);
		expect(line).not.toBeNull();
		// bottom edge = H - y - height = 700, spanning the full width.
		expect(line!.start).toEqual({ x: 50, y: 700 });
		expect(line!.end).toEqual({ x: 170, y: 700 });
		expect(line!.strokeWidth).toBe(2);
	});

	it('strikethrough draws a line across the vertical centre', () => {
		const { line } = capture(markup({ markup: 'strikethrough' }), H);
		// centre = bottom + height/2 = 700 + 10 = 710.
		expect(line!.start).toEqual({ x: 50, y: 710 });
		expect(line!.end).toEqual({ x: 170, y: 710 });
	});

	it('underline/strikethrough default thickness to 1.5', () => {
		const { line } = capture(markup({ markup: 'underline' }), H);
		expect(line!.strokeWidth).toBe(1.5);
	});
});
