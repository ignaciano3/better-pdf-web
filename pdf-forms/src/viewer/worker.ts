import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Sets the pdfjs worker once, on first document load (not as an import side
 * effect). A consumer that already configured GlobalWorkerOptions.workerSrc
 * wins.
 */
export function ensurePdfWorker(): void {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
}
