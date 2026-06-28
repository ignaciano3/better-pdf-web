import type { FieldElement, FieldKind } from '$lib/pdf/types';
import { rectToTopLeft, type PdfRect } from '$lib/pdf/coords';

/**
 * The subset of better-pdf's `FieldInfo` the mapper relies on. Declared locally
 * (rather than imported) so this pure module stays unit-testable without pulling
 * the WASM core graph into the test, and so it can be exercised with plain
 * fixtures.
 */
export interface FieldWidgetInfo {
	page: number;
	rect: PdfRect;
}
export interface FieldInfoLike {
	name: string;
	type:
		| 'text'
		| 'checkbox'
		| 'radio'
		| 'dropdown'
		| 'listbox'
		| 'signature'
		| 'pushbutton'
		| 'unknown';
	value: string | null;
	states: string[];
	options: string[];
	readOnly: boolean;
	required: boolean;
	maxLength: number | null;
	multiSelect: boolean;
	widgets: FieldWidgetInfo[];
}

/** Map a detected field type to our {@link FieldKind}, or null to skip it. */
function toFieldKind(type: FieldInfoLike['type']): FieldKind | null {
	switch (type) {
		case 'text':
		case 'checkbox':
		case 'radio':
		case 'dropdown':
		case 'listbox':
		case 'signature':
			return type;
		default:
			// pushbutton / unknown — not representable as a fillable element.
			return null;
	}
}

/**
 * Convert one detected `FieldInfo` into a {@link FieldElement} positioned from
 * its first widget. `pageHeights` supplies the page height used to flip the
 * widget rect (bottom-left) into the editor's top-left convention. Returns null
 * for unsupported field types or fields with no widget.
 *
 * `idFor` produces a stable element id (the caller threads a counter through).
 */
export function fieldInfoToElement(
	info: FieldInfoLike,
	pageHeights: number[],
	id: string
): FieldElement | null {
	const kind = toFieldKind(info.type);
	if (!kind) return null;
	const widget = info.widgets[0];
	if (!widget) return null;
	const pageHeight = pageHeights[widget.page] ?? 0;
	const box = rectToTopLeft(widget.rect, pageHeight);

	const element: FieldElement = {
		type: 'field',
		id,
		field: kind,
		name: info.name,
		x: box.x,
		y: box.y,
		width: box.width,
		height: box.height,
		page: widget.page
	};
	if (info.required) element.required = true;
	if (info.readOnly) element.readOnly = true;
	if (kind === 'radio') {
		// Radio options live in `states` (the on-state export values); `options`
		// is empty for radios. Each button is its own widget, so build a
		// `radioLayout` of per-option top-left positions index-aligned with the
		// options. Without this the overlay renders no buttons (empty options) and
		// would stack them at the anchor (no layout).
		if (info.states.length > 0) element.options = [...info.states];
		const layout = info.widgets.map((w) => {
			const h = pageHeights[w.page] ?? 0;
			const b = rectToTopLeft(w.rect, h);
			return { x: b.x, y: b.y };
		});
		if (layout.length > 0) element.radioLayout = layout;
	} else if (info.options.length > 0) {
		element.options = [...info.options];
	}
	// "Off" is the AcroForm unselected sentinel for checkbox/radio, not a value.
	if (info.value != null && info.value !== '' && info.value !== 'Off') element.value = info.value;
	if (kind === 'text' && info.maxLength != null) element.maxLength = info.maxLength;
	return element;
}

/**
 * Map every supported detected field to a {@link FieldElement}. Skips
 * pushbuttons, unknown types, and widget-less fields. Ids are
 * `field0`, `field1`, … so they don't collide with the editor's own counter
 * (the editor reseeds its counter from these on load).
 */
export function mapFields(fields: FieldInfoLike[], pageHeights: number[]): FieldElement[] {
	const out: FieldElement[] = [];
	let i = 0;
	for (const info of fields) {
		const el = fieldInfoToElement(info, pageHeights, `field${i}`);
		if (el) {
			out.push(el);
			i++;
		}
	}
	return out;
}
