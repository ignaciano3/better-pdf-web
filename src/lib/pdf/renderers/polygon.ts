import { rgb } from '@ignaciano3/better-pdf/generate';
import type { PolygonElement } from '../types';
import type { ElementRenderer } from './types';

/**
 * Draw a polygon via `page.drawPolygon`. `points` are absolute top-left-origin
 * PDF points; each point's Y is flipped to the PDF bottom-left origin
 * (`pageHeight - p.y`). `drawPolygon` needs at least 2 points, so fewer draw
 * nothing. `closed` defaults to true (an unset value lets the lib default).
 */
export const renderPolygon: ElementRenderer<PolygonElement> = ({ page, pageHeight }, element) => {
	const { points, closed, strokeColor, fillColor, strokeWidth, opacity } = element;
	if (!points || points.length < 2) return;

	const pts = points.map((p) => ({ x: p.x, y: pageHeight - p.y }));

	page.drawPolygon(pts, {
		stroke: strokeColor ? rgb(strokeColor.r, strokeColor.g, strokeColor.b) : rgb(0, 0, 0),
		strokeWidth: strokeWidth ?? 1,
		...(fillColor ? { fill: rgb(fillColor.r, fillColor.g, fillColor.b) } : {}),
		...(opacity !== undefined ? { opacity } : {}),
		...(closed !== undefined ? { closed } : {})
	});
};
