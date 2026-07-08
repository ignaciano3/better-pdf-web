import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderText } from './renderers/text';
import type { RenderContext } from './renderers/types';
import type { PdfFont, PdfPage } from '@ignaciano3/better-pdf/generate';
import type { EditState, TextElement } from './types';

// A real Latin-only TTF, borrowed from the already-installed pdfjs-dist
// dependency, so tests can exercise a genuine `doc.embedFont` + `drawText`
// round-trip without bundling a font fixture of our own. It has no glyph for
// the unicorn emoji used below, which is exactly what the MissingGlyphError
// test needs.
const require = createRequire(import.meta.url);
const FONT_BYTES = new Uint8Array(
	readFileSync(require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'))
);

/**
 * No .ttf/.otf fixture is bundled, so rather than exercising a real
 * `doc.embedFont` round-trip we assert the plumbing that matters: `renderText`
 * passes an embedded `PdfFont` handle (from `ctx.fonts[fontId]`) to `drawText`
 * when the element references one, and falls back to the standard font name
 * otherwise. The build wires `embedFont` results into `ctx.fonts` (covered by
 * the other build.*.test.ts suites that go through `buildPdf`).
 */
function ctxWith(fonts: Record<string, PdfFont>): {
	ctx: RenderContext;
	drawText: ReturnType<typeof vi.fn>;
} {
	const drawText = vi.fn();
	const page = { drawText } as unknown as PdfPage;
	const ctx: RenderContext = {
		doc: {} as RenderContext['doc'],
		page,
		pageHeight: 800,
		fonts
	};
	return { ctx, drawText };
}

function text(overrides: Partial<TextElement> = {}): TextElement {
	return { type: 'text', id: 't0', text: 'hi', x: 10, y: 20, size: 12, ...overrides };
}

describe('renderText — custom font selection', () => {
	it('passes the embedded PdfFont handle when fontId resolves', () => {
		const handle = { __embedded: true } as unknown as PdfFont;
		const { ctx, drawText } = ctxWith({ myfont: handle });
		renderText(ctx, text({ fontId: 'myfont', font: 'Times-Bold' }));
		expect(drawText).toHaveBeenCalledTimes(1);
		const opts = drawText.mock.calls[0]?.[1];
		// Embedded handle wins over the standard `font`.
		expect(opts.font).toBe(handle);
	});

	it('falls back to the standard font name when fontId is unknown', () => {
		const { ctx, drawText } = ctxWith({});
		renderText(ctx, text({ fontId: 'missing', font: 'Times-Bold' }));
		const opts = drawText.mock.calls[0]?.[1];
		expect(opts.font).toBe('Times-Bold');
	});

	it('uses the standard font when no fontId is set', () => {
		const { ctx, drawText } = ctxWith({});
		renderText(ctx, text({ font: 'Courier' }));
		const opts = drawText.mock.calls[0]?.[1];
		expect(opts.font).toBe('Courier');
	});
});

describe('buildPdf — font assets thread through', () => {
	// NOTE: the lib defers font-validation to save(), so a genuinely corrupt
	// font program only fails at finalize (not at embedFont) — embedFonts cannot
	// pre-detect it. An empty-bytes asset IS skipped by embedFonts. A text
	// element whose fontId never resolves simply falls back to its standard font.
	it('skips an empty-bytes font asset and export still succeeds', async () => {
		const { buildPdf } = await import('./build');
		const bytes = await buildPdf({
			pageSize: [595, 842],
			elements: [text({ fontId: 'f1', font: 'Helvetica' })],
			fonts: [{ id: 'f1', name: 'empty.ttf', bytes: new Uint8Array(0) }]
		});
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
	});

	it('a fontId with no matching asset falls back to the standard font', async () => {
		const { buildPdf } = await import('./build');
		const bytes = await buildPdf({
			pageSize: [595, 842],
			elements: [text({ fontId: 'missing', font: 'Times-Roman' })]
		});
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
	});

	it('maps MissingGlyphError to a friendly PdfBuildError', async () => {
		const { buildPdf } = await import('./build');
		const state: EditState = {
			pageSize: [400, 500],
			fonts: [{ id: 'f1', bytes: FONT_BYTES, name: 'Fixture' }],
			elements: [
				{ type: 'text', id: 't1', x: 20, y: 20, page: 0, text: '\u{1F984}', size: 14, fontId: 'f1' }
			]
		};
		await expect(buildPdf(state)).rejects.toMatchObject({
			name: 'PdfBuildError',
			message: expect.stringContaining('does not contain some of the characters')
		});
	});
});
