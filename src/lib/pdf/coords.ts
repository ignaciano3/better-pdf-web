/**
 * Coordinate conversions between a PDF widget `/Rect` (origin bottom-left) and
 * the editor's element box (top-left origin, in PDF points). Shared by field
 * detection (extractFields), overlays, and the export rebuild so the math lives
 * in exactly one place.
 *
 * A PDF rect is `[x0, y0, x1, y1]` with the origin at the page's bottom-left;
 * `(x0, y0)` is the lower-left corner and `(x1, y1)` the upper-right. The editor
 * stores a box as `{ x, y, width, height }` where `(x, y)` is the *top-left*
 * corner measured from the page's *top* edge.
 */

/** A box in the editor's top-left convention, in PDF points. */
export interface TopLeftBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A PDF `/Rect`: `[x0, y0, x1, y1]`, origin bottom-left. */
export type PdfRect = [number, number, number, number];

/**
 * Convert a PDF widget rect (origin bottom-left) to a top-left box.
 *
 * ```
 * x      = x0
 * y      = pageHeight - y1   // distance from the top edge to the box's top
 * width  = x1 - x0
 * height = y1 - y0
 * ```
 */
export function rectToTopLeft(rect: PdfRect, pageHeight: number): TopLeftBox {
	const [x0, y0, x1, y1] = rect;
	const left = Math.min(x0, x1);
	const right = Math.max(x0, x1);
	const bottom = Math.min(y0, y1);
	const top = Math.max(y0, y1);
	return {
		x: left,
		y: pageHeight - top,
		width: right - left,
		height: top - bottom
	};
}

/**
 * Convert a top-left box back to a PDF rect (origin bottom-left). Inverse of
 * {@link rectToTopLeft}.
 *
 * ```
 * x0 = x
 * y0 = pageHeight - y - height   // bottom edge
 * x1 = x + width
 * y1 = pageHeight - y            // top edge
 * ```
 */
export function topLeftToRect(box: TopLeftBox, pageHeight: number): PdfRect {
	return [box.x, pageHeight - box.y - box.height, box.x + box.width, pageHeight - box.y];
}

/**
 * The bottom-left Y coordinate (PDF convention) of a top-left box's bottom edge.
 * This is what authoring APIs (`addTextField`, `addCheckBox`, …) expect as `y`.
 */
export function topLeftToPdfY(y: number, height: number, pageHeight: number): number {
	return pageHeight - y - height;
}
