// Map a PDF base-14 standard font name to CSS so editor previews match export.
// The name encodes family + weight/style in its suffix, e.g. `Times-BoldItalic`,
// `Helvetica-BoldOblique`. Custom embedded fonts carry no such suffix, so they
// fall through to the regular Helvetica stack.

/** CSS font-family stack for a standard PDF font name. */
export function fontFamily(name: string | undefined): string {
	if (name?.startsWith('Times')) return 'Times, "Times New Roman", serif';
	if (name?.startsWith('Courier')) return '"Courier New", Courier, monospace';
	return 'Helvetica, Arial, sans-serif';
}

/** 700 for a Bold variant, else 400. */
export function fontWeight(name: string | undefined): number {
	return name?.includes('Bold') ? 700 : 400;
}

/** `italic` for an Italic/Oblique variant, else `normal`. */
export function fontStyle(name: string | undefined): 'italic' | 'normal' {
	return name && (name.includes('Italic') || name.includes('Oblique')) ? 'italic' : 'normal';
}

/**
 * Full inline-style block (`font-family:…;font-weight:…;font-style:…;`) for a
 * standard PDF font name. Weight/style are emitted only when non-default so the
 * result stays minimal when appended to an existing style string.
 */
export function fontCss(name: string | undefined): string {
	if (!name) return '';
	let s = `font-family:${fontFamily(name)};`;
	if (name.includes('Bold')) s += 'font-weight:bold;';
	if (name.includes('Italic') || name.includes('Oblique')) s += 'font-style:italic;';
	return s;
}
