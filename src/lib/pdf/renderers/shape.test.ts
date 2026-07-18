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
	return {
		type: 'shape',
		id: 'l',
		shape: 'line',
		x: 50,
		y: 80,
		width: 120,
		height: 90,
		...overrides
	};
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

describe('renderShape — strokeless fill (whiteout)', () => {
	function captureRect(element: ShapeElement, pageHeight = 800) {
		let rect: Record<string, unknown> | null = null;
		const page = {
			drawLine: () => {},
			drawRectangle: (a: Record<string, unknown>) => (rect = a),
			drawEllipse: () => {}
		};
		renderShape({ page, pageHeight } as unknown as RenderContext, element);
		return rect as Record<string, unknown> | null;
	}

	it('a filled rectangle with no strokeColor draws fill and NO stroke', () => {
		const rect = captureRect({
			type: 'shape',
			id: 'w',
			shape: 'rectangle',
			x: 10,
			y: 20,
			width: 100,
			height: 30,
			fillColor: { r: 1, g: 1, b: 1 }
			// strokeColor intentionally omitted (whiteout cover)
		});
		expect(rect).not.toBeNull();
		expect(rect!['fill']).toBeDefined();
		expect(rect!['stroke']).toBeUndefined();
		expect(rect!['strokeWidth']).toBeUndefined();
	});

	it('a rectangle WITH strokeColor still draws its stroke', () => {
		const rect = captureRect({
			type: 'shape',
			id: 's',
			shape: 'rectangle',
			x: 0,
			y: 0,
			width: 10,
			height: 10,
			strokeColor: { r: 0, g: 0, b: 0 }
		});
		expect(rect!['stroke']).toBeDefined();
	});
});
