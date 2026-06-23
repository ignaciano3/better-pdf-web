/** Default page size (A4) in PDF points, used in blank mode. */
export const DEFAULT_PAGE: [number, number] = [595.28, 841.89];

/** CSS px rendered per PDF point. Element coords are stored in points and
 * positioned at `coord * SCALE` px; the builder flips Y at export. */
export const SCALE = 0.8;

/** Upload guards (bytes). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Default placed widths (PDF points); height derived from intrinsic aspect. */
export const SIGNATURE_DEFAULT_WIDTH = 180;
export const IMAGE_DEFAULT_WIDTH = 200;

/** One page's geometry on the canvas. */
export interface PageInfo {
	/** Page width in PDF points. */
	width: number;
	/** Page height in PDF points. */
	height: number;
}

/** A pending raster placement: the next page click drops it as an element. */
export interface PendingRaster {
	image: Uint8Array;
	format: 'png' | 'jpg';
	aspect: number;
}
