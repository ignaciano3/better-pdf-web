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

/** Default stroke for a newly drawn shape (black, 1pt). */
export const SHAPE_DEFAULT_STROKE: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 };
export const SHAPE_DEFAULT_STROKE_WIDTH = 1;

/** Minimum bounding-box side (PDF points) so a stray click still yields a shape. */
export const SHAPE_MIN_SIZE = 6;

/** What a page click/drag does. `select` edits existing elements only. */
export type DrawKind =
	| 'text'
	| 'image'
	| 'signature'
	| 'line'
	| 'rectangle'
	| 'ellipse'
	| 'path'
	| 'polygon'
	| 'link';

/** Default stroke width (PDF points) for a newly drawn path/polygon. */
export const VECTOR_DEFAULT_STROKE_WIDTH = 2;

/** Default size (PDF points) for a link rect created by a stray click (no drag). */
export const LINK_DEFAULT_SIZE: { width: number; height: number } = { width: 120, height: 24 };

/** Max custom-font upload size (bytes); mirrors the server-side cap. */
export const MAX_FONT_BYTES = 5 * 1024 * 1024;
export type { FieldKind } from '$lib/pdf/types';
import type { FieldKind } from '$lib/pdf/types';
export type Tool =
	| { type: 'select' }
	| { type: 'draw'; kind: DrawKind }
	| { type: 'field'; kind: FieldKind };

/** The idle tool: clicks select/deselect, never create. */
export const SELECT_TOOL: Tool = { type: 'select' };

/** Default widget size per field kind, in PDF points (top-left box). */
export const FIELD_DEFAULT_SIZE: Record<FieldKind, { width: number; height: number }> = {
	text: { width: 160, height: 24 },
	checkbox: { width: 18, height: 18 },
	radio: { width: 18, height: 18 },
	dropdown: { width: 160, height: 24 },
	combo: { width: 160, height: 24 },
	listbox: { width: 160, height: 80 },
	signature: { width: 180, height: 60 }
};
