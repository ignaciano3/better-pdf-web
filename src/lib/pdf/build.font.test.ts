import { describe, it, expect, vi } from 'vitest';
import { renderText } from './renderers/text';
import type { RenderContext } from './renderers/types';
import type { PdfFont, PdfPage } from '@ignaciano3/better-pdf/generate';
import type { TextElement } from './types';

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
});
