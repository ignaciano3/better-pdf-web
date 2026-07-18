import { rgb } from '@ignaciano3/better-pdf/generate';
import type { MarkupElement } from '../types';
import type { ElementRenderer } from './types';

/**
 * Draw text markup (highlight, underline, or strikethrough) over a region. The
 * element's `x`/`y` is the top-left corner of the box in top-left coordinates,
 * so the PDF bottom edge sits at `pageHeight - y - height`.
 *
 * - highlight: a semi-transparent filled rectangle over the whole box.
 * - underline: a line along the box's bottom edge.
 * - strikethrough: a line across the box's vertical centre.
 */
export const renderMarkup: ElementRenderer<MarkupElement> = ({ page, pageHeight }, element) => {
	const { x, y, width, height, color } = element;
	const fill = rgb(color.r, color.g, color.b);
	const bottom = pageHeight - y - height;

	if (element.markup === 'highlight') {
		// No stroke — just a translucent fill. `opacity` defaults to 0.4 so text
		// underneath stays legible.
		page.drawRectangle({ x, y: bottom, width, height, fill, opacity: element.opacity ?? 0.4 });
		return;
	}

	// Underline sits on the bottom edge; strikethrough on the vertical centre.
	const lineY = element.markup === 'strikethrough' ? bottom + height / 2 : bottom;
	page.drawLine({
		start: { x, y: lineY },
		end: { x: x + width, y: lineY },
		stroke: fill,
		strokeWidth: element.thickness ?? 1.5
	});
};
