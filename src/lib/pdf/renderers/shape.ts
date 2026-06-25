import { rgb } from '@ignaciano3/better-pdf/generate';
import type { ShapeElement } from '../types';
import type { ElementRenderer } from './types';

/**
 * Draw a vector shape (line, rectangle, or ellipse). The element's `x`/`y` is
 * the top-left corner of the bounding box in top-left coordinates, so the PDF
 * bottom edge sits at `pageHeight - y - height`. A `line` is drawn as the
 * diagonal of its bounding box (visual top-left → bottom-right).
 */
export const renderShape: ElementRenderer<ShapeElement> = ({ page, pageHeight }, element) => {
	const { x, y, width, height, strokeColor, fillColor, strokeWidth } = element;
	const stroke = strokeColor ? rgb(strokeColor.r, strokeColor.g, strokeColor.b) : rgb(0, 0, 0);
	const lineWidth = strokeWidth ?? 1;
	// Bottom edge of the box after the top-left → bottom-left Y flip.
	const bottom = pageHeight - y - height;
	const top = pageHeight - y;

	switch (element.shape) {
		case 'line':
			// Anti-diagonal lines run top-right → bottom-left; the default diagonal
			// runs top-left → bottom-right.
			page.drawLine({
				start: element.antidiagonal ? { x: x + width, y: top } : { x, y: top },
				end: element.antidiagonal ? { x, y: bottom } : { x: x + width, y: bottom },
				stroke,
				strokeWidth: lineWidth
			});
			break;
		case 'rectangle':
			page.drawRectangle({
				x,
				y: bottom,
				width,
				height,
				stroke,
				strokeWidth: lineWidth,
				...(fillColor ? { fill: rgb(fillColor.r, fillColor.g, fillColor.b) } : {})
			});
			break;
		case 'ellipse':
			page.drawEllipse({
				x: x + width / 2,
				y: bottom + height / 2,
				radiusX: width / 2,
				radiusY: height / 2,
				stroke,
				strokeWidth: lineWidth,
				...(fillColor ? { fill: rgb(fillColor.r, fillColor.g, fillColor.b) } : {})
			});
			break;
	}
};
