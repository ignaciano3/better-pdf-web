import { PageSizes } from '@ignaciano3/better-pdf/generate';

/** Default page size (A4) in PDF points, used in blank mode. */
export const DEFAULT_PAGE: [number, number] = [...PageSizes.A4];

/** Named blank-page sizes the user can insert (#5), sourced from the better-pdf
 * `PageSizes` table. `null` size keeps the "clone the first page" behaviour. */
export const PAGE_SIZES: { label: string; size: [number, number] | null }[] = [
	{ label: 'Match document', size: null },
	...Object.entries(PageSizes).map(([label, dims]) => ({
		label,
		size: [...dims] as [number, number]
	}))
];

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
	| 'highlight'
	| 'underline'
	| 'strikethrough'
	| 'path'
	| 'polygon'
	| 'link';

/** Default markup colours (RGB 0..1): yellow highlight, black lines. */
export const MARKUP_HIGHLIGHT_COLOR = { r: 1, g: 0.92, b: 0.23 };
export const MARKUP_LINE_COLOR = { r: 0, g: 0, b: 0 };
/** Default highlight fill opacity so covered text stays legible. */
export const MARKUP_DEFAULT_OPACITY = 0.4;
/** Default underline/strikethrough line width in PDF points. */
export const MARKUP_DEFAULT_THICKNESS = 1.5;

/** Default stroke width (PDF points) for a newly drawn path/polygon. */
export const VECTOR_DEFAULT_STROKE_WIDTH = 2;

/** Default size (PDF points) for a link rect created by a stray click (no drag). */
export const LINK_DEFAULT_SIZE: { width: number; height: number } = { width: 120, height: 24 };

/** Max custom-font upload size (bytes); mirrors the server-side cap. */
export const MAX_FONT_BYTES = 5 * 1024 * 1024;

/** Max size of a single file the user can embed as an attachment. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Canvas zoom bounds (1 = 100%). */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
/** Zoom step for the −/+ buttons. */
export const ZOOM_STEP = 0.25;

/** Max undo/redo steps retained; older entries are dropped from the bottom. */
export const HISTORY_LIMIT = 100;
/** Idle gap (ms) before edits are committed as one undo step, so a drag or a
 * burst of typing coalesces into a single entry instead of one per frame/key. */
export const HISTORY_DEBOUNCE_MS = 350;

/** Named output page sizes (PDF points) the page-size dropdown offers. */
export const NAMED_PAGE_SIZES: { label: string; size: [number, number] }[] = [
	{ label: 'A4', size: [595.28, 841.89] },
	{ label: 'Letter', size: [612, 792] },
	{ label: 'Legal', size: [612, 1008] },
	{ label: 'A3', size: [841.89, 1190.55] }
];
export type { FieldKind } from '$lib/pdf/types';
import type { FieldKind } from '$lib/pdf/types';
export type Tool =
	| { type: 'select' }
	| { type: 'draw'; kind: DrawKind }
	| { type: 'field'; kind: FieldKind };

/** The idle tool: clicks select/deselect, never create. */
export const SELECT_TOOL: Tool = { type: 'select' };

/** Single-key accelerators for the draw tools (no modifier). Power users hit the
 * letter to switch tools instead of mousing to the toolbar; the same letters are
 * surfaced in each button's tooltip. `image` is intentionally absent — it opens a
 * file picker, which we keep behind an explicit click. `v` resets to select. */
export const DRAW_SHORTCUTS: Partial<Record<DrawKind, string>> = {
	text: 't',
	line: 'l',
	rectangle: 'r',
	ellipse: 'e',
	polygon: 'p',
	path: 'd',
	link: 'k',
	signature: 's',
	highlight: 'h',
	underline: 'u',
	strikethrough: 'g'
};

/** Reverse lookup (key → draw kind) for the keyboard handler. */
export const SHORTCUT_TO_DRAW: Record<string, DrawKind> = Object.fromEntries(
	Object.entries(DRAW_SHORTCUTS).map(([kind, key]) => [key, kind as DrawKind])
);

/** Key that returns to the select tool. */
export const SELECT_SHORTCUT = 'v';

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
