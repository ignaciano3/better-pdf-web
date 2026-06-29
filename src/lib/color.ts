/** An RGB color with each channel in the 0..1 range, as used throughout the
 * editor and passed to better-pdf's `rgb()`. */
export interface Rgb {
	r: number;
	g: number;
	b: number;
}

/** Format an {@link Rgb} (0..1 channels) as a `#rrggbb` string for a native
 * `<input type="color">`. A missing color defaults to black. Channels are
 * clamped to 0..1 before scaling so an out-of-range value never overflows. */
export function rgbToHex(c: Rgb | undefined): string {
	const v = c ?? { r: 0, g: 0, b: 0 };
	const h = (n: number) =>
		Math.round(Math.max(0, Math.min(1, n)) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${h(v.r)}${h(v.g)}${h(v.b)}`;
}

/** Parse a `#rrggbb` string (as produced by a color input) into an {@link Rgb}
 * with 0..1 channels. */
export function hexToRgb(hex: string): Rgb {
	return {
		r: parseInt(hex.slice(1, 3), 16) / 255,
		g: parseInt(hex.slice(3, 5), 16) / 255,
		b: parseInt(hex.slice(5, 7), 16) / 255
	};
}
