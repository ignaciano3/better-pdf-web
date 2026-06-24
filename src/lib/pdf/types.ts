/**
 * Editor document state. Coordinates use a top-left origin in PDF points
 * (the canvas convention); the PDF builder flips the Y axis to the
 * PDF bottom-left origin at finalize time.
 */
export interface EditState {
	/**
	 * Page size in PDF points: [width, height]. In blank mode this is the size
	 * of the single created page. When `sourcePdf` is present, page sizes come
	 * from the loaded document and this is the size of its first page.
	 */
	pageSize: [number, number];
	elements: EditElement[];
	/**
	 * Raw bytes of an uploaded source PDF. When present, the builder loads this
	 * document and stamps elements on top of its existing pages instead of
	 * creating a fresh single-page document.
	 */
	sourcePdf?: Uint8Array;
	/**
	 * Ordered list of output pages (reorder / delete / insert-blank / rotate).
	 * When present, it fully describes the page layout of the exported document:
	 * one {@link PageOp} per output page, in output order. Element `page` indices
	 * are **output positions** — i.e. the index of the page in this list — so
	 * stamping resolves to the right page after any reordering or insertion.
	 *
	 * When absent the builder keeps the source document's pages as-is.
	 */
	pageOps?: PageOp[];
}

/**
 * One output page. Either it mirrors a page from the loaded source document
 * (`kind: 'source'`, identified by its original zero-based index) or it is a
 * freshly inserted blank page (`kind: 'blank'`, with its own size). Both carry a
 * rotation in degrees (a multiple of 90).
 */
export type PageOp =
	| {
			kind: 'source';
			/** Zero-based index of the page in the originally loaded source PDF. */
			sourceIndex: number;
			/** Clockwise rotation applied on export; normalised to 0/90/180/270. */
			rotation: number;
	  }
	| {
			kind: 'blank';
			/** Size of the inserted blank page in PDF points: [width, height]. */
			size: [number, number];
			/** Clockwise rotation applied on export; normalised to 0/90/180/270. */
			rotation: number;
	  };

export interface TextElement {
	type: 'text';
	id: string;
	text: string;
	/** Distance from the left edge, in PDF points. */
	x: number;
	/** Distance from the top edge, in PDF points (top-left origin). */
	y: number;
	/** Font size in points. */
	size: number;
	/**
	 * Zero-based index of the page this element belongs to. Defaults to 0.
	 * Used so multi-page source documents stamp each element onto the right page.
	 */
	page?: number;
	/** RGB components in 0..1. Defaults to black. */
	color?: { r: number; g: number; b: number };
}

/**
 * An image-backed signature element — produced either by drawing on the
 * in-app signature pad (transparent-background PNG) or by uploading an image.
 * Like {@link TextElement}, `x`/`y` are the top-left corner in PDF points with
 * a top-left origin; the builder flips the Y axis at finalize time.
 */
export interface SignatureElement {
	type: 'signature';
	id: string;
	/** Distance from the left edge, in PDF points. */
	x: number;
	/** Distance from the top edge, in PDF points (top-left origin). */
	y: number;
	/** Rendered width in PDF points. */
	width: number;
	/** Rendered height in PDF points. */
	height: number;
	/**
	 * Zero-based index of the page this element belongs to. Defaults to 0.
	 * Used so multi-page source documents stamp each element onto the right page.
	 */
	page?: number;
	/** Raw image bytes. Transparency in PNGs is preserved on export. */
	image: Uint8Array;
	/** Encoding of `image`, so the builder picks `embedPng` vs `embedJpg`. */
	format: 'png' | 'jpg';
}

/**
 * An uploaded raster image element. Structurally identical to
 * {@link SignatureElement} but with a distinct `type` discriminant so the
 * editor can treat signatures and general images independently. `x`/`y` are the
 * top-left corner in PDF points (top-left origin); the builder flips the Y axis
 * at finalize time.
 */
export interface ImageElement {
	type: 'image';
	id: string;
	/** Distance from the left edge, in PDF points. */
	x: number;
	/** Distance from the top edge, in PDF points (top-left origin). */
	y: number;
	/** Rendered width in PDF points. */
	width: number;
	/** Rendered height in PDF points. */
	height: number;
	/**
	 * Zero-based index of the page this element belongs to. Defaults to 0.
	 * Used so multi-page source documents stamp each element onto the right page.
	 */
	page?: number;
	/** Raw image bytes. Transparency in PNGs is preserved on export. */
	image: Uint8Array;
	/** Encoding of `image`, so the builder picks `embedPng` vs `embedJpg`. */
	format: 'png' | 'jpg';
}

/** Discriminated union of everything the editor can stamp onto a page. */
export type EditElement = TextElement | SignatureElement | ImageElement;
