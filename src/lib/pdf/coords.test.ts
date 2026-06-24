import { describe, it, expect } from 'vitest';
import { rectToTopLeft, topLeftToRect, topLeftToPdfY, type PdfRect } from './coords';

describe('coords', () => {
	const pageHeight = 400;

	it('rectToTopLeft converts a bottom-left rect to a top-left box', () => {
		// Rect from (50, 100) to (150, 130): 100 wide, 30 tall, top edge at y1=130.
		const box = rectToTopLeft([50, 100, 150, 130], pageHeight);
		expect(box).toEqual({ x: 50, y: pageHeight - 130, width: 100, height: 30 });
	});

	it('topLeftToRect is the inverse of rectToTopLeft', () => {
		const rect: PdfRect = [50, 100, 150, 130];
		const box = rectToTopLeft(rect, pageHeight);
		const back = topLeftToRect(box, pageHeight);
		expect(back).toEqual(rect);
	});

	it('round-trips an arbitrary box top-left → rect → top-left', () => {
		const box = { x: 12.5, y: 33.25, width: 88, height: 19.75 };
		const rect = topLeftToRect(box, pageHeight);
		const back = rectToTopLeft(rect, pageHeight);
		expect(back.x).toBeCloseTo(box.x, 6);
		expect(back.y).toBeCloseTo(box.y, 6);
		expect(back.width).toBeCloseTo(box.width, 6);
		expect(back.height).toBeCloseTo(box.height, 6);
	});

	it('normalises a rect given in either corner order', () => {
		const a = rectToTopLeft([150, 130, 50, 100], pageHeight);
		const b = rectToTopLeft([50, 100, 150, 130], pageHeight);
		expect(a).toEqual(b);
	});

	it('topLeftToPdfY gives the bottom edge in PDF convention', () => {
		expect(topLeftToPdfY(10, 30, pageHeight)).toBe(pageHeight - 10 - 30);
	});
});
