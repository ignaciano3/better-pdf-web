import { rgb, StandardFonts } from '@ignaciano3/better-pdf/generate';
import type { StandardFontName, TextElement } from '../types';
import type { ElementRenderer } from './types';

/** Map our stored font name to the lib's StandardFonts enum value. */
function toFont(name: StandardFontName | undefined): StandardFonts | undefined {
	return name ? (name as StandardFonts) : undefined;
}

/**
 * Draw a text element. `y` is the element's top edge in top-left coordinates,
 * so the baseline sits one font-size below it after the Y flip. `rotation` is
 * stored clockwise (CSS convention); drawText rotates counter-clockwise.
 */
export const renderText: ElementRenderer<TextElement> = ({ page, pageHeight }, element) => {
	const baselineY = pageHeight - element.y - element.size;
	const { color, font, opacity, rotation, lineHeight, maxWidth } = element;
	const f = toFont(font);
	page.drawText(element.text, {
		x: element.x,
		y: baselineY,
		size: element.size,
		...(color ? { color: rgb(color.r, color.g, color.b) } : {}),
		...(f ? { font: f } : {}),
		...(opacity !== undefined ? { opacity } : {}),
		...(rotation !== undefined ? { rotate: -rotation } : {}),
		...(lineHeight !== undefined ? { lineHeight } : {}),
		...(maxWidth !== undefined ? { maxWidth } : {})
	});
};
