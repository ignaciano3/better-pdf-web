// pdf.js touches browser-only globals (DOMMatrix, etc.) at module load, so it
// must never be imported during SSR. It's loaded lazily, in the browser only,
// the first time a render is requested.
type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | undefined;

export async function loadPdfjs(): Promise<PdfJs> {
	if (!pdfjsPromise) {
		pdfjsPromise = (async () => {
			const pdfjs = await import('pdfjs-dist');
			// Vite resolves this to a hashed URL for the bundled worker module.
			const worker = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
			pdfjs.GlobalWorkerOptions.workerSrc = worker;
			return pdfjs;
		})();
	}
	return pdfjsPromise;
}

/** A rasterized source page, ready to display behind the editing layer. */
export interface RenderedPage {
	/** Page width in PDF points (scale-1 viewport). */
	width: number;
	/** Page height in PDF points (scale-1 viewport). */
	height: number;
	/** PNG data URL of the page rendered at the editor scale. */
	dataUrl: string;
}

/**
 * How many raster pixels to produce per displayed CSS pixel. A native PDF
 * viewer renders at the screen's device-pixel ratio (and re-renders on zoom);
 * we approximate that "looks like my PDF viewer" sharpness by baking the DPR
 * into the raster plus a little zoom headroom, so the page stays crisp at the
 * zoom levels people actually use without re-rendering. Rendering at exactly the
 * display size (no oversample) is what made uploads look soft next to the
 * exported PDF. Capped so multi-page docs don't blow up memory / data-URL size.
 */
function renderOversample(): number {
	const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
	// The PNG is now only the placeholder/thumbnail; PdfPageCanvas owns on-screen
	// sharpness by re-rasterising on zoom. Keep just enough resolution to look
	// crisp at fit/normal zoom, clamped to [1.5, 2] to keep data-URLs small.
	return Math.min(2, Math.max(1.5, dpr));
}

/** Thrown when an uploaded PDF cannot be parsed or rendered. */
export class PdfRenderError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'PdfRenderError';
	}
}

/**
 * Render every page of a source PDF to PNG data URLs using pdf.js.
 *
 * Pages are rasterized at `scale` CSS px per PDF point so they line up with the
 * editor's coordinate convention (element coords are stored in PDF points and
 * positioned at `coord * scale` px). Page dimensions are reported at scale 1 so
 * callers can size the editing surface and flip Y at export time.
 *
 * @throws {PdfRenderError} on corrupt, encrypted, or unsupported input.
 */
export async function renderSourcePdf(bytes: Uint8Array, scale: number): Promise<RenderedPage[]> {
	const { getDocument } = await loadPdfjs();
	// pdf.js may detach the buffer; pass a copy so the caller's bytes survive.
	const loadingTask = getDocument({ data: bytes.slice() });
	let doc;
	try {
		doc = await loadingTask.promise;
	} catch (cause) {
		throw new PdfRenderError(
			'Could not open that PDF. It may be corrupt, encrypted, or not a valid PDF.',
			{ cause }
		);
	}

	try {
		const out: RenderedPage[] = [];
		const oversample = renderOversample();
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const baseViewport = page.getViewport({ scale: 1 });
			// Render oversampled for sharpness; the image is still *displayed* at the
			// scale-1 size × the editor scale, so this only adds pixels, not size.
			const viewport = page.getViewport({ scale: scale * oversample });

			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);

			await page.render({ canvas, viewport }).promise;
			out.push({
				width: baseViewport.width,
				height: baseViewport.height,
				dataUrl: canvas.toDataURL('image/png')
			});
			page.cleanup();
		}
		return out;
	} catch (cause) {
		if (cause instanceof PdfRenderError) throw cause;
		throw new PdfRenderError('Could not render that PDF.', { cause });
	} finally {
		await loadingTask.destroy();
	}
}
