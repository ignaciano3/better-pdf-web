import { describe, it, expect } from 'vitest';
import { renderShape } from './shape';
import type { RenderContext } from './types';
import type { ShapeElement } from '../types';

/** A line drawn into a captured PdfPage stub; records the last drawLine call. */
function captureLine(element: ShapeElement, pageHeight: number) {
	let captured: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
	const page = {
		drawLine: (args: { start: { x: number; y: number }; end: { x: number; y: number } }) => {
			captured = { start: args.start, end: args.end };
		},
		drawRectangle: () => {},
		drawEllipse: () => {}
	};
	const ctx = { page, pageHeight } as unknown as RenderContext;
	renderShape(ctx, element);
	return captured as unknown as {
		start: { x: number; y: number };
		end: { x: number; y: number };
	};
}

function line(overrides: Partial<ShapeElement> = {}): ShapeElement {
	return { type: 'shape', id: 'l', shape: 'line', x: 50, y: 80, width: 120, height: 90, ...overrides };
}

describe('renderShape — line direction (#1)', () => {
	const H = 800; // pageHeight; top = H - y, bottom = H - y - height

	it('default line runs top-left → bottom-right', () => {
		const { start, end } = captureLine(line(), H);
		// top-left corner of the box at the top, bottom-right corner at the bottom.
		expect(start).toEqual({ x: 50, y: 720 });
		expect(end).toEqual({ x: 170, y: 630 });
	});

	it('anti-diagonal line runs top-right → bottom-left', () => {
		const { start, end } = captureLine(line({ antidiagonal: true }), H);
		// top-right corner of the box at the top, bottom-left corner at the bottom.
		expect(start).toEqual({ x: 170, y: 720 });
		expect(end).toEqual({ x: 50, y: 630 });
	});
});
