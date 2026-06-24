import type { LinkElement } from '../types';
import type { ElementRenderer } from './types';
import { topLeftToPdfY } from '../coords';

/**
 * Add a clickable link annotation. The element's `y` is its top edge, so the PDF
 * bottom edge sits at `topLeftToPdfY(y, height, pageHeight)`. Exactly one of
 * `url` / `goToPage` must be set (validated upstream); a link with neither (or a
 * blank url) is skipped rather than throwing.
 */
export const renderLink: ElementRenderer<LinkElement> = ({ page, pageHeight }, element) => {
	const { x, y, width, height, url, goToPage } = element;
	const hasUrl = typeof url === 'string' && url.length > 0;
	const hasGoTo = typeof goToPage === 'number';
	if (hasUrl === hasGoTo) return; // neither or both → nothing valid to author

	const rect = { x, y: topLeftToPdfY(y, height, pageHeight), width, height };
	if (hasUrl) {
		page.drawLink({ ...rect, url });
	} else {
		page.drawLink({ ...rect, goToPage: goToPage as number });
	}
};
