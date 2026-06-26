import { rgb } from '@ignaciano3/better-pdf/generate';
import type { PathElement } from '../types';
import type { ElementRenderer } from './types';

/**
 * Draw a vector path as an SVG `d` string. `points` are absolute top-left-origin
 * PDF points; each point's Y is flipped to the PDF bottom-left origin
 * (`pageHeight - p.y`). An empty point list draws nothing. A `closed` path
 * appends a `Z` segment.
 */
export const renderPath: ElementRenderer<PathElement> = ({ page, pageHeight }, element) => {
	const { points, closed, strokeColor, fillColor, strokeWidth, opacity, dash, dashPhase } = element;
	if (!points || points.length === 0) return;

	const d =
		points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${pageHeight - p.y}`).join(' ') +
		(closed ? ' Z' : '');

	page.drawSvgPath(d, {
		stroke: strokeColor ? rgb(strokeColor.r, strokeColor.g, strokeColor.b) : rgb(0, 0, 0),
		strokeWidth: strokeWidth ?? 1,
		...(fillColor ? { fill: rgb(fillColor.r, fillColor.g, fillColor.b) } : {}),
		...(opacity !== undefined ? { opacity } : {}),
		...(dash && dash.length > 0 ? { dash } : {}),
		...(dashPhase !== undefined ? { dashPhase } : {})
	});
};
