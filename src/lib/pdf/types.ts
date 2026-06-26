import type { OutlineItem } from '@ignaciano3/better-pdf';

export type { OutlineItem };

/**
 * Editable document metadata. Each field maps to a `doc.setX` call at export.
 * All fields are optional; omitted ones are not written.
 */
export interface DocumentMetadataInput {
	title?: string;
	author?: string;
	subject?: string;
	keywords?: string[];
	creator?: string;
	producer?: string;
}

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
	 *
	 * Back-compat single-source field. When {@link sources} is also set, the
	 * builder uses {@link sources}; otherwise it treats `sourcePdf` as
	 * `sources[0]`. A `source` {@link PageOp} with no `docIndex` (or `docIndex: 0`)
	 * embeds from this document.
	 */
	sourcePdf?: Uint8Array;
	/**
	 * Multiple uploaded source documents, for merge/append. Index 0 is the
	 * primary document (equivalent to {@link sourcePdf}); later indices are
	 * appended documents. A `source` {@link PageOp} selects its document via
	 * `docIndex`. When present this takes precedence over {@link sourcePdf}.
	 */
	sources?: Uint8Array[];
	/**
	 * Document metadata applied on export via `doc.setTitle`/`setAuthor`/etc.
	 * Any field left undefined is not written.
	 */
	metadata?: DocumentMetadataInput;
	/**
	 * Document outline (bookmarks). Applied via `doc.setOutline` when non-empty.
	 * Each item's `page` is a zero-based **output** page index.
	 */
	outline?: OutlineItem[];
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
	/**
	 * Custom fonts to embed. Each is embedded once at export and made available
	 * to text elements that reference it via {@link TextElement.fontId}. Assets
	 * referenced by no text element are harmlessly unused.
	 */
	fonts?: EmbeddedFontAsset[];
	/**
	 * When true, every authored AcroForm field is flattened (baked into page
	 * content) on export, producing a print-ready, non-editable PDF. No-op when
	 * the document has no fields.
	 */
	flatten?: boolean;
	/**
	 * Optional text watermark stamped on every output page at export. Omitted
	 * when unset or when its text is empty.
	 */
	watermark?: Watermark;
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
			/**
			 * Which source document this page comes from (index into
			 * {@link EditState.sources}). Defaults to 0 (the primary document).
			 */
			docIndex?: number;
			/**
			 * Explicit output page-size override in PDF points: [width, height].
			 * When set, the output page is created at this size and the embedded
			 * source content is scaled to fit. Omit to keep the source page's size.
			 */
			size?: [number, number];
	  }
	| {
			kind: 'blank';
			/** Size of the inserted blank page in PDF points: [width, height]. */
			size: [number, number];
			/** Clockwise rotation applied on export; normalised to 0/90/180/270. */
			rotation: number;
	  };

/** The 12 standard PDF fonts better-pdf exposes without embedding. */
export type StandardFontName =
	| 'Helvetica'
	| 'Helvetica-Bold'
	| 'Helvetica-Oblique'
	| 'Helvetica-BoldOblique'
	| 'Courier'
	| 'Courier-Bold'
	| 'Courier-Oblique'
	| 'Courier-BoldOblique'
	| 'Times-Roman'
	| 'Times-Bold'
	| 'Times-Italic'
	| 'Times-BoldItalic';

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
	/** One of the 12 standard fonts. Defaults to Helvetica. */
	font?: StandardFontName;
	/** Opacity 0..1. Defaults to 1. */
	opacity?: number;
	/** Clockwise rotation in degrees for display; counter-clockwise at draw. */
	rotation?: number;
	/** Baseline distance for multi-line text. Defaults to 1.15 * size. */
	lineHeight?: number;
	/** Word-wrap width in PDF points. Omit for no wrap. */
	maxWidth?: number;
	/**
	 * References an {@link EmbeddedFontAsset.id} on {@link EditState.fonts}. When
	 * set (and the asset embeds successfully) it overrides {@link font}; otherwise
	 * the renderer falls back to the standard {@link font}.
	 */
	fontId?: string;
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

/** The kinds of vector shape the editor can draw. */
export type ShapeKind = 'line' | 'rectangle' | 'ellipse';

/**
 * A vector shape element (line, rectangle, or ellipse). Like the other
 * elements, `x`/`y` are the top-left corner of the shape's bounding box in PDF
 * points with a top-left origin; `width`/`height` are the box dimensions and the
 * builder flips the Y axis at finalize time. A `line` is drawn as the diagonal
 * of its bounding box (top-left → bottom-right).
 */
export interface ShapeElement {
	type: 'shape';
	id: string;
	/** Which primitive to draw. */
	shape: ShapeKind;
	/** Distance from the left edge, in PDF points. */
	x: number;
	/** Distance from the top edge, in PDF points (top-left origin). */
	y: number;
	/** Bounding-box width in PDF points. */
	width: number;
	/** Bounding-box height in PDF points. */
	height: number;
	/**
	 * Zero-based index of the page this element belongs to. Defaults to 0.
	 * Used so multi-page source documents stamp each element onto the right page.
	 */
	page?: number;
	/** Stroke RGB components in 0..1. Defaults to black. */
	strokeColor?: { r: number; g: number; b: number };
	/** Stroke width in PDF points. Defaults to 1. */
	strokeWidth?: number;
	/** Fill RGB components in 0..1. Omit for no fill (rectangle/ellipse only). */
	fillColor?: { r: number; g: number; b: number };
	/**
	 * For `line` only: when true the line runs along the anti-diagonal of its
	 * bounding box (visual top-right → bottom-left) instead of the default
	 * top-left → bottom-right. Set from the drag direction at draw time.
	 */
	antidiagonal?: boolean;
}

/**
 * A free vector path: an ordered list of points stamped as an SVG path. Used by
 * the freehand drawing tool (`closed: false` polyline) and closed vector shapes.
 * `points` are absolute top-left-origin PDF points; `x`/`y` mirror the bounding
 * box's top-left corner so {@link import('../../routes/editor/editor.svelte').EditorState.startDrag}
 * can translate the whole element (it shifts every point by the same delta).
 */
export interface PathElement {
	type: 'path';
	id: string;
	/** Bounding-box left edge (top-left origin, PDF points). */
	x: number;
	/** Bounding-box top edge (top-left origin, PDF points). */
	y: number;
	/** Zero-based output page index. Defaults to 0. */
	page?: number;
	/** Absolute top-left-origin PDF points; the renderer flips each point's Y. */
	points: { x: number; y: number }[];
	/** Close the path with a `Z` segment. Defaults to false (open polyline). */
	closed?: boolean;
	/** Stroke RGB components in 0..1. Defaults to black. */
	strokeColor?: { r: number; g: number; b: number };
	/** Stroke width in PDF points. Defaults to 1. */
	strokeWidth?: number;
	/** Fill RGB components in 0..1. Omit for no fill. */
	fillColor?: { r: number; g: number; b: number };
	/** Opacity 0..1. Defaults to 1. */
	opacity?: number;
}

/**
 * A polygon: a multi-vertex closed (default) or open shape stamped via
 * `page.drawPolygon`. Same coordinate conventions as {@link PathElement}.
 */
export interface PolygonElement {
	type: 'polygon';
	id: string;
	/** Bounding-box left edge (top-left origin, PDF points). */
	x: number;
	/** Bounding-box top edge (top-left origin, PDF points). */
	y: number;
	/** Zero-based output page index. Defaults to 0. */
	page?: number;
	/** Absolute top-left-origin PDF points; the renderer flips each point's Y. */
	points: { x: number; y: number }[];
	/** Close the polygon. Defaults to true. */
	closed?: boolean;
	/** Stroke RGB components in 0..1. Defaults to black. */
	strokeColor?: { r: number; g: number; b: number };
	/** Stroke width in PDF points. Defaults to 1. */
	strokeWidth?: number;
	/** Fill RGB components in 0..1. Omit for no fill. */
	fillColor?: { r: number; g: number; b: number };
	/** Opacity 0..1. Defaults to 1. */
	opacity?: number;
}

/**
 * A clickable link annotation over a rectangular region. Exactly one of
 * {@link url} (external) or {@link goToPage} (internal, 0-based page index) must
 * be set. Like the other elements, `x`/`y` is the top-left corner in PDF points
 * (top-left origin); the renderer flips Y when authoring the link rect.
 */
export interface LinkElement {
	type: 'link';
	id: string;
	/** Distance from the left edge, in PDF points. */
	x: number;
	/** Distance from the top edge, in PDF points (top-left origin). */
	y: number;
	/** Link rect width in PDF points. */
	width: number;
	/** Link rect height in PDF points. */
	height: number;
	/** Zero-based output page index. Defaults to 0. */
	page?: number;
	/** External URL target; mutually exclusive with {@link goToPage}. */
	url?: string;
	/** Internal 0-based page target; mutually exclusive with {@link url}. */
	goToPage?: number;
}

/**
 * A custom TrueType/OpenType font uploaded in the editor and embedded into the
 * exported PDF. Referenced by {@link TextElement.fontId}.
 */
export interface EmbeddedFontAsset {
	/** Stable id referenced by {@link TextElement.fontId}. */
	id: string;
	/** Display name (the uploaded file's name). */
	name: string;
	/** Raw font-program bytes (the .ttf/.otf file contents). */
	bytes: Uint8Array;
}

/**
 * A single text watermark stamped centered, rotated, and semi-transparent on
 * every output page at export. v1 is text-only — the lib's `drawImage` has no
 * opacity/rotation, so image watermarks are deferred.
 */
export interface Watermark {
	/** The watermark text (e.g. "DRAFT"). Empty/whitespace ⇒ no watermark. */
	text: string;
	/** Standard font. Defaults to Helvetica-Bold. */
	font?: StandardFontName;
	/** Font size in points. Defaults to 48. */
	size?: number;
	/** RGB components in 0..1. Defaults to mid-gray. */
	color?: { r: number; g: number; b: number };
	/** Opacity 0..1. Defaults to 0.3. */
	opacity?: number;
	/** Clockwise display rotation in degrees. Defaults to 45. */
	rotation?: number;
}

/**
 * The kinds of AcroForm field the editor can read and author.
 *
 * `dropdown` and `combo` both author via `addDropdown`; `combo` is an editable
 * (combo) dropdown while `dropdown` is a plain selection list. They are kept
 * distinct in the model so the UI can offer both; the export maps both through
 * `addDropdown`, passing `editable: true` only for `combo` so the user can type
 * a custom value (a plain dropdown is a non-editable combo).
 */
export type FieldKind =
	| 'text'
	| 'checkbox'
	| 'radio'
	| 'dropdown'
	| 'signature'
	| 'listbox'
	| 'combo';

/**
 * An interactive AcroForm field, either detected on upload (D1) or authored in
 * the editor (D2). Detected and authored fields are the same shape and behave
 * identically. Like the other elements, `x`/`y` are the top-left corner in PDF
 * points with a top-left origin; the export rebuild flips Y when authoring the
 * widget rect (see {@link import('./coords').topLeftToRect}).
 */
export interface FieldElement {
	type: 'field';
	id: string;
	/** Which AcroForm field kind this is. */
	field: FieldKind;
	/** Fully-qualified AcroForm field name; unique within the document. */
	name: string;
	/** Distance from the left edge, in PDF points. */
	x: number;
	/** Distance from the top edge, in PDF points (top-left origin). */
	y: number;
	/** Widget width in PDF points. */
	width: number;
	/** Widget height in PDF points. */
	height: number;
	/** Zero-based output page index. Defaults to 0. */
	page?: number;
	/** Required flag. */
	required?: boolean;
	/** Read-only flag. */
	readOnly?: boolean;
	/** Tooltip / user-facing description. */
	tooltip?: string;
	/** Widget border color (RGB 0..1) and optional width in points. */
	border?: { color: { r: number; g: number; b: number }; width?: number };
	/** Widget background fill color (RGB 0..1). */
	background?: { r: number; g: number; b: number };
	/**
	 * Color of the field's value text (RGB 0..1). Defaults to black. Meaningful
	 * for fields that render text: text, dropdown, combo, listbox. Maps to the
	 * lib's `textColor` field option at export.
	 */
	textColor?: { r: number; g: number; b: number };
	/**
	 * Current fill value. For checkbox it is the on-state value when checked (or
	 * '' when unchecked); for signature it is a PNG data URL of the drawn image.
	 */
	value?: string;
	/** Options for dropdown / radio / listbox / combo. */
	options?: string[];
	/**
	 * Radio only: per-option widget positions (top-left PDF points), index-aligned
	 * with {@link options}. Lets each radio button be placed independently instead
	 * of stacking below the anchor. When absent (or shorter than `options`) missing
	 * entries fall back to a vertical stack starting at `x`/`y`.
	 */
	radioLayout?: { x: number; y: number }[];
	/** Placeholder text (text fields only). */
	placeholder?: string;
	/** Max length (text fields only). */
	maxLength?: number;
	/** Multiline flag (text fields only). */
	multiline?: boolean;
}

/** Discriminated union of everything the editor can stamp onto a page. */
export type EditElement =
	| TextElement
	| SignatureElement
	| ImageElement
	| ShapeElement
	| PathElement
	| PolygonElement
	| LinkElement
	| FieldElement;
