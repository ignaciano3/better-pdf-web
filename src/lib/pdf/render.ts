// pdf.js touches browser-only globals (DOMMatrix, etc.) at module load, so it
// must never be imported during SSR. It's loaded lazily, in the browser only,
// the first time a render is requested.
type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | undefined;

async function loadPdfjs(): Promise<PdfJs> {
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
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const baseViewport = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({ scale });

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
