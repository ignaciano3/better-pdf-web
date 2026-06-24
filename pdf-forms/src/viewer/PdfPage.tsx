import type * as pdfjsLib from "pdfjs-dist";
import { memo, useEffect, useRef, useState } from "react";
import type { FieldInfo } from "../fields";
import { cssRectToPdf, type PdfRect, pdfRectToCss } from "./coords";
import { FormField } from "./FormField";
import styles from "./PdfFormViewer.module.css";

export type PdfPageProps = {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  fields: FieldInfo[];
  pageHeight: number;
  scale: number;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  placing?: boolean;
  onPlace?: (pageIndex: number, rect: PdfRect) => void;
  onRemoveSignature?: (id: string) => void;
};

/** Mínimo de tamaño (px de pantalla) para considerar válido un rectángulo. */
const MIN_PLACE_PX = 12;

function PdfPageImpl({
  pdfDoc,
  pageNumber,
  fields,
  pageHeight,
  scale,
  values,
  onChange,
  placing,
  onPlace,
  onRemoveSignature,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    async function render() {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Backing store at devicePixelRatio for crisp output on HiDPI screens;
      // CSS size (and all overlay math) stays in CSS px. The backing store
      // must use the render viewport's own dimensions — flooring
      // viewport.width * dpr separately desyncs them on fractional DPRs.
      const dpr = window.devicePixelRatio || 1;
      const renderViewport = page.getViewport({ scale: scale * dpr });
      canvas.width = renderViewport.width;
      canvas.height = renderViewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setDims({ width: viewport.width, height: viewport.height });

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTask = page.render({
        canvasContext: ctx,
        viewport: renderViewport,
        canvas,
      });
      await renderTask.promise;
      if (!cancelled) setReady(true);
    }

    render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, scale]);

  const localPos = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = overlayRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!placing) return;
    e.preventDefault();
    overlayRef.current?.setPointerCapture(e.pointerId);
    const p = localPos(e);
    dragStart.current = p;
    setDragRect({ left: p.x, top: p.y, width: 0, height: 0 });
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStart.current;
    if (!placing || !s) return;
    const p = localPos(e);
    setDragRect({
      left: Math.min(s.x, p.x),
      top: Math.min(s.y, p.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    });
  };

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStart.current;
    dragStart.current = null;
    setDragRect(null);
    if (!placing || !s) return;
    overlayRef.current?.releasePointerCapture(e.pointerId);
    const p = localPos(e);
    const css = {
      left: Math.min(s.x, p.x),
      top: Math.min(s.y, p.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    };
    if (css.width < MIN_PLACE_PX || css.height < MIN_PLACE_PX) return;
    onPlace?.(pageNumber - 1, cssRectToPdf(css, pageHeight, scale));
  };

  return (
    <div
      className={styles.page}
      style={{ width: dims.width || "auto", height: dims.height || "auto" }}
    >
      <canvas ref={canvasRef} />
      {ready &&
        fields.map((field) => (
          <FormField
            key={field.id}
            field={field}
            style={pdfRectToCss(field.rect, pageHeight, scale)}
            value={values[field.name] ?? ""}
            onChange={onChange}
            onRemoveSignature={onRemoveSignature}
          />
        ))}
      {ready &&
        fields
          .filter((f) => f.required)
          .map((f) => {
            const css = pdfRectToCss(f.rect, pageHeight, scale);
            return (
              <span
                key={`req-${f.id}`}
                className={styles.requiredMark}
                style={{ left: css.left + css.width - 6, top: css.top - 6 }}
              >
                *
              </span>
            );
          })}
      {ready && placing && (
        <div
          ref={overlayRef}
          className={styles.placeOverlay}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          {dragRect && (
            <div className={styles.placeRect} style={{ ...dragRect }} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A keystroke updates one shared `values` object; without this comparator every
 * page (all its inputs) re-renders on each keystroke. Pages only care about
 * the values of their own fields.
 *
 * The bailout only works if consumers pass identity-stable callbacks
 * (`onChange`/`onPlace`/`onRemoveSignature`) — an inline closure re-created
 * each render forces a full page re-render. Reading `prev.values` keyed by
 * `next.fields` is safe: a `fields` identity change already returned false.
 */
function propsEqual(prev: PdfPageProps, next: PdfPageProps): boolean {
  if (
    prev.pdfDoc !== next.pdfDoc ||
    prev.pageNumber !== next.pageNumber ||
    prev.fields !== next.fields ||
    prev.pageHeight !== next.pageHeight ||
    prev.scale !== next.scale ||
    prev.placing !== next.placing ||
    prev.onChange !== next.onChange ||
    prev.onPlace !== next.onPlace ||
    prev.onRemoveSignature !== next.onRemoveSignature
  ) {
    return false;
  }
  if (prev.values === next.values) return true;
  return next.fields.every((f) => prev.values[f.name] === next.values[f.name]);
}

export const PdfPage = memo(PdfPageImpl, propsEqual);
