import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfjs } from './render';

/**
 * Lazily opens and caches one live pdf.js {@link PDFDocumentProxy} per source
 * document index, so the editor can re-rasterise pages on zoom instead of
 * scaling a frozen PNG. Documents are opened from a COPY of the bytes (pdf.js
 * detaches the buffer it reads) and must be destroyed via {@link destroy} /
 * {@link destroyAll} to free pdf.js worker memory.
 */
export class PdfDocStore {
	// Cache the promise (not the resolved proxy) so concurrent callers for the
	// same docIndex share a single open instead of racing two `getDocument`s.
	#docs = new Map<number, Promise<PDFDocumentProxy>>();

	/** The live proxy for `docIndex`, opening it from `bytes` on first request. */
	get(docIndex: number, bytes: Uint8Array): Promise<PDFDocumentProxy> {
		let existing = this.#docs.get(docIndex);
		if (!existing) {
			existing = (async () => {
				const { getDocument } = await loadPdfjs();
				// pdf.js may detach the buffer; open from a copy.
				return getDocument({ data: bytes.slice() }).promise;
			})();
			this.#docs.set(docIndex, existing);
		}
		return existing;
	}

	/** Evict and destroy the document for one `docIndex` (no-op if absent). */
	async destroy(docIndex: number): Promise<void> {
		const p = this.#docs.get(docIndex);
		this.#docs.delete(docIndex);
		if (!p) return;
		try {
			(await p).destroy();
		} catch {
			// A document that failed to open has nothing to free.
		}
	}

	/** Evict and destroy every cached document. */
	async destroyAll(): Promise<void> {
		const all = [...this.#docs.values()];
		this.#docs.clear();
		for (const p of all) {
			try {
				(await p).destroy();
			} catch {
				// ignore per-doc teardown failures
			}
		}
	}
}
