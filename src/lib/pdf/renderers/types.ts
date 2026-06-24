import type { PdfDocument } from '@ignaciano3/better-pdf';
import type { PdfFont, PdfPage } from '@ignaciano3/better-pdf/generate';
import type { EditElement } from '../types';

/**
 * Everything a renderer needs to stamp one element onto a page. `pageHeight` is
 * passed explicitly because it differs per page in source-load mode and drives
 * the top-left → bottom-left Y flip.
 */
export interface RenderContext {
	doc: PdfDocument;
	page: PdfPage;
	pageHeight: number;
	/**
	 * Embedded custom-font handles keyed by {@link import('../types').EmbeddedFontAsset.id}.
	 * Empty when no fonts are embedded (blank / standard-font cases). A text
	 * element with a `fontId` present here draws with that handle.
	 */
	fonts: Record<string, PdfFont>;
}

/**
 * Draws a single element of type `T` onto the page. May be async (image
 * embedding hits the wasm core). New element types are added by writing one of
 * these and registering it — no edits to existing renderers.
 */
export type ElementRenderer<T extends EditElement = EditElement> = (
	ctx: RenderContext,
	element: T
) => void | Promise<void>;
