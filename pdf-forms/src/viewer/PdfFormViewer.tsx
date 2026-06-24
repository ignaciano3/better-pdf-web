import * as pdfjsLib from "pdfjs-dist";
import type { Ref } from "react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { type FieldInfo, normalizeRadioValue } from "../fields";
import type { PdfRect } from "./coords";
import { HourglassIcon } from "./icons";
import styles from "./PdfFormViewer.module.css";
import { PdfPage } from "./PdfPage";
import { ensurePdfWorker } from "./worker";

const DEFAULT_SCALE = 1.5;

export type PdfFormViewerRef = {
  getValues: () => Record<string, string>;
};

type Props = {
  pdfBytes: Uint8Array;
  fields: FieldInfo[];
  pageHeights: number[];
  initialValues: Record<string, string>;
  ref?: Ref<PdfFormViewerRef>;
  /** Render scale (PDF units → CSS px). Default 1.5. */
  scale?: number;
  /** Modo "colocar firma": arrastrar sobre la página dibuja una zona. */
  placing?: boolean;
  onPlace?: (pageIndex: number, rect: PdfRect) => void;
  onRemoveSignature?: (id: string) => void;
};

export function PdfFormViewer({
  pdfBytes,
  fields,
  pageHeights,
  initialValues,
  ref,
  scale = DEFAULT_SCALE,
  placing,
  onPlace,
  onRemoveSignature,
}: Props) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => {
    const nextValues = { ...initialValues };
    for (const field of fields) {
      const current = nextValues[field.name];
      if (field.type === "radio" && current !== undefined) {
        nextValues[field.name] = normalizeRadioValue(current);
      }
    }
    setValues(nextValues);
  }, [initialValues, fields]);

  useImperativeHandle(ref, () => ({
    getValues: () => values,
  }));

  useEffect(() => {
    let task: pdfjsLib.PDFDocumentLoadingTask | null = null;
    let cancelled = false;

    async function load() {
      ensurePdfWorker();
      const copy = pdfBytes.slice(0);
      task = pdfjsLib.getDocument({ data: copy });
      const doc = await task.promise;
      if (!cancelled) setPdfDoc(doc);
    }

    load();
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [pdfBytes]);

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Stable per-page arrays so memo(PdfPage) can bail out by identity.
  const fieldsByPage = useMemo(() => {
    const map = new Map<number, FieldInfo[]>();
    for (const f of fields) {
      const list = map.get(f.pageIndex);
      if (list) list.push(f);
      else map.set(f.pageIndex, [f]);
    }
    return map;
  }, [fields]);

  const EMPTY_FIELDS: FieldInfo[] = useMemo(() => [], []);

  if (!pdfDoc) {
    return (
      <div className={styles.loading}>
        <HourglassIcon />
        Cargando formulario...
      </div>
    );
  }

  return (
    <div className={styles.viewer}>
      {Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map(
        (pageNum) => (
          <PdfPage
            key={pageNum}
            pdfDoc={pdfDoc}
            pageNumber={pageNum}
            fields={fieldsByPage.get(pageNum - 1) ?? EMPTY_FIELDS}
            pageHeight={pageHeights[pageNum - 1] ?? 0}
            scale={scale}
            values={values}
            onChange={handleChange}
            placing={placing}
            onPlace={onPlace}
            onRemoveSignature={onRemoveSignature}
          />
        ),
      )}
    </div>
  );
}
