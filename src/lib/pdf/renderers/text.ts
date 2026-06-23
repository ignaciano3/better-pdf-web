import { rgb } from '@ignaciano3/better-pdf/generate';
import type { TextElement } from '../types';
import type { ElementRenderer } from './types';

/**
 * Draw a text element. `y` is the element's top edge in top-left coordinates,
 * so the baseline sits one font-size below it after the Y flip.
 */
export const renderText: ElementRenderer<TextElement> = ({ page, pageHeight }, element) => {
	const baselineY = pageHeight - element.y - element.size;
	const { color } = element;
	page.drawText(element.text, {
		x: element.x,
		y: baselineY,
		size: element.size,
		...(color ? { color: rgb(color.r, color.g, color.b) } : {})
	});
};
