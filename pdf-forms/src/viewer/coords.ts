export type PdfRect = { x: number; y: number; width: number; height: number };

export type CssRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** PDF rect (origin bottom-left, PDF units) → CSS px rect (origin top-left). */
export function pdfRectToCss(
  rect: PdfRect,
  pageHeight: number,
  scale: number,
): CssRect {
  return {
    left: rect.x * scale,
    top: (pageHeight - rect.y - rect.height) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** CSS px rect (origin top-left) → PDF rect (origin bottom-left, PDF units). */
export function cssRectToPdf(
  rect: CssRect,
  pageHeight: number,
  scale: number,
): PdfRect {
  return {
    x: rect.left / scale,
    y: pageHeight - rect.top / scale - rect.height / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}
