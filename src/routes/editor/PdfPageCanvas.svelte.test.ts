import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';

vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('./extractFields.remote', () => ({ extractFields: vi.fn() }));

// Capture every viewport scale the component requests.
const requestedScales: number[] = [];

// A fake pdf.js page/doc the editor's getPdfDoc resolves to.
function fakePage() {
	return {
		getViewport: ({ scale }: { scale: number }) => {
			requestedScales.push(scale);
			return { width: 100 * scale, height: 100 * scale };
		},
		render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
		cleanup: vi.fn()
	};
}

import PdfPageCanvas from './PdfPageCanvas.svelte';
import { EditorState } from './editor.svelte';
import type { RenderedPage } from '$lib/pdf/render';

// Force a deterministic device pixel ratio.
Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

// jsdom has no IntersectionObserver: stub it to report "visible" immediately.
class IO {
	cb: IntersectionObserverCallback;
	constructor(cb: IntersectionObserverCallback) {
		this.cb = cb;
	}
	observe(el: Element) {
		this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
	}
	unobserve() {}
	disconnect() {}
}
vi.stubGlobal('IntersectionObserver', IO as never);

const renderInfo: RenderedPage = { width: 100, height: 100, dataUrl: 'data:image/png;base64,AAAA' };

function makeEditor() {
	const editor = new EditorState();
	editor.sources = [new Uint8Array([1, 2, 3])];
	// Resolve getPdfDoc to a fake document.
	vi.spyOn(editor, 'getPdfDoc').mockResolvedValue({
		getPage: vi.fn(async () => fakePage()),
		destroy: vi.fn()
	} as never);
	return editor;
}

beforeEach(() => {
	requestedScales.length = 0;
	vi.useFakeTimers();
});

afterEach(() => {
	// Restore real timers before @testing-library/svelte's afterEach(act()) runs,
	// otherwise act() awaits a microtask that never resolves with fake timers.
	vi.useRealTimers();
});

describe('PdfPageCanvas', () => {
	it('requests viewport scale SCALE*zoom*dpr when visible', async () => {
		const editor = makeEditor();
		editor.zoom = 1;
		render(PdfPageCanvas, {
			props: { editor, docIndex: 0, sourceIndex: 0, render: renderInfo, rotation: 0, box: { width: 100, height: 100 } }
		});
		flushSync();
		await vi.advanceTimersByTimeAsync(200); // past the debounce
		// SCALE (0.8) * zoom (1) * dpr (2) = 1.6
		expect(requestedScales.at(-1)).toBeCloseTo(1.6, 5);
	});

	it('re-renders at a larger scale after zoom increases', async () => {
		const editor = makeEditor();
		editor.zoom = 1;
		render(PdfPageCanvas, {
			props: { editor, docIndex: 0, sourceIndex: 0, render: renderInfo, rotation: 0, box: { width: 100, height: 100 } }
		});
		flushSync();
		await vi.advanceTimersByTimeAsync(200);
		const first = requestedScales.at(-1)!;

		editor.zoom = 4;
		flushSync();
		await vi.advanceTimersByTimeAsync(200);
		const second = requestedScales.at(-1)!;

		expect(second).toBeCloseTo(0.8 * 4 * 2, 5); // 6.4
		expect(second).toBeGreaterThan(first);
	});

	it('renders the PNG placeholder img', () => {
		const editor = makeEditor();
		const { container } = render(PdfPageCanvas, {
			props: { editor, docIndex: 0, sourceIndex: 0, render: renderInfo, rotation: 0, box: { width: 100, height: 100 } }
		});
		const img = container.querySelector('img');
		expect(img?.getAttribute('src')).toBe(renderInfo.dataUrl);
	});
});
