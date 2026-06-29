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
	hidden?: boolean;
	print?: boolean;
	noView?: boolean;
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
	defaultValue?: string | null;
	password?: boolean;
	multiline?: boolean;
	comb?: boolean;
	editable?: boolean;
	align?: 'left' | 'center' | 'right';
	tooltip?: string | null;
	fontSize?: number | null;
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
	let kind = toFieldKind(info.type);
	if (!kind) return null;
	const widget = info.widgets[0];
	if (!widget) return null;
	// Hidden / no-view widgets can't be re-authored hidden by the builder; the
	// rebuild would turn them visible, so skip them on import.
	if (widget.hidden || widget.noView) return null;
	// An editable dropdown is our `combo` kind.
	if (kind === 'dropdown' && info.editable) kind = 'combo';
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
	// A multi-select list box reports its /V array as a comma-joined string; split
	// it back into selectedValues (valid options only) instead of a single value.
	if (kind === 'listbox' && info.multiSelect) {
		element.multiSelect = true;
		if (info.value != null && info.value !== '') {
			const opts = element.options ?? [];
			const vals = info.value
				.split(',')
				.map((s) => s.trim())
				.filter((v) => opts.includes(v));
			if (vals.length > 0) element.selectedValues = vals;
		}
	} else if (info.value != null && info.value !== '' && info.value !== 'Off') {
		element.value = info.value;
	}
	if (kind === 'text' && info.maxLength != null) element.maxLength = info.maxLength;
	if (info.tooltip) element.tooltip = info.tooltip;
	const isValueText =
		kind === 'text' || kind === 'dropdown' || kind === 'combo' || kind === 'listbox';
	if (isValueText) {
		if (info.align && info.align !== 'left') element.align = info.align;
		if (info.fontSize != null && info.fontSize > 0) element.fontSize = info.fontSize;
	}
	if (kind === 'text') {
		if (info.multiline) element.multiline = true;
		if (info.password) element.password = true;
		if (info.comb && info.maxLength != null) element.comb = true;
	}
	// Reset default (/DV) → per-kind default property. "Off"/empty are sentinels.
	const dv = info.defaultValue;
	if (dv != null && dv !== '' && dv !== 'Off') {
		if (kind === 'text') element.defaultValue = dv;
		else if (kind === 'checkbox') element.defaultChecked = true;
		else if (kind === 'radio') {
			if (info.states.includes(dv)) element.defaultSelected = dv;
		} else if (kind === 'dropdown' || kind === 'combo' || kind === 'listbox') {
			if (info.options.includes(dv)) element.defaultSelected = dv;
		}
	}
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
