import type { PDFImage, PDFWidgetAnnotation } from "pdf-lib";
import { type PDFDict, PDFDocument, PDFRawStream } from "pdf-lib";
import { downloadFile } from "./download";
import type { FieldInfo } from "./fields";
import { fillPdfBytes } from "./fill";

export type SignaturePlacement = {
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  /** PNG dataURL (`data:image/png;base64,...`) de la firma dibujada. */
  pngDataUrl: string;
  /** AcroField name — used to locate the widget and set its appearance. */
  fieldName: string;
};

/**
 * Embeds the drawn PNG as the Normal appearance (/AP /N) of an AcroField
 * widget. The signature lives inside the field's own structure instead of
 * being painted as a raw page overlay, consistent with how other AcroField
 * values are rendered (text fields, checkboxes, etc.).
 */
function setWidgetSignatureAppearance(
  pdfDoc: PDFDocument,
  widget: PDFWidgetAnnotation,
  png: PDFImage,
): void {
  const { width, height } = widget.getRectangle();
  const scale = Math.min(width / png.width, height / png.height);
  const imgW = png.width * scale;
  const imgH = png.height * scale;
  const imgX = (width - imgW) / 2;
  const imgY = (height - imgH) / 2;

  const xObject = PDFRawStream.of(
    pdfDoc.context.obj({
      Type: "XObject",
      Subtype: "Form",
      BBox: pdfDoc.context.obj([0, 0, width, height]),
      Resources: pdfDoc.context.obj({
        XObject: pdfDoc.context.obj({ Img: png.ref }),
      }),
    }) as PDFDict,
    new TextEncoder().encode(
      `q ${imgW} 0 0 ${imgH} ${imgX} ${imgY} cm /Img Do Q`,
    ),
  );

  widget.setNormalAppearance(pdfDoc.context.register(xObject));
}

/**
 * For each placement:
 * - If the PDF has an AcroField matching `fieldName`, embeds the PNG as the
 *   widget's Normal appearance (in-field, consistent with other AcroFields).
 * - Otherwise (manually-placed zone, e.g. from FirmaTestPage) falls back to
 *   drawing the image directly on the page.
 */
export async function stampSignatures(
  pdfBytes: Uint8Array,
  placements: SignaturePlacement[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();

  for (const p of placements) {
    if (!p.pngDataUrl) continue;

    const png = await pdfDoc.embedPng(p.pngDataUrl);

    let handled = false;
    try {
      const field = form.getField(p.fieldName);
      for (const widget of field.acroField.getWidgets()) {
        setWidgetSignatureAppearance(pdfDoc, widget, png);
      }
      handled = true;
    } catch {
      // Field absent from this PDF's AcroForm (manually-placed zone).
    }

    if (!handled) {
      const page = pages[p.pageIndex];
      if (!page) continue;
      const scale = Math.min(
        p.rect.width / png.width,
        p.rect.height / png.height,
      );
      const w = png.width * scale;
      const h = png.height * scale;
      const x = p.rect.x + (p.rect.width - w) / 2;
      const y = p.rect.y + (p.rect.height - h) / 2;
      page.drawImage(png, { x, y, width: w, height: h });
    }
  }

  return pdfDoc.save();
}

/**
 * Fills AcroField values and embeds drawn signatures. Signature field values
 * (PNG dataURLs) are routed to stampSignatures instead of fillPdfBytes.
 */
export async function fillAndSign(
  pdfBytes: Uint8Array,
  values: Record<string, string>,
  fields: FieldInfo[],
): Promise<Uint8Array> {
  const signatureFields = fields.filter((f) => f.type === "signature");
  const signatureNames = new Set(signatureFields.map((f) => f.name));

  const textValues: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (!signatureNames.has(name)) textValues[name] = value;
  }

  const filled = await fillPdfBytes(pdfBytes, textValues);

  const placements: SignaturePlacement[] = signatureFields
    .map((f) => ({
      pageIndex: f.pageIndex,
      rect: f.rect,
      pngDataUrl: values[f.name] ?? "",
      fieldName: f.name,
    }))
    .filter((p) => p.pngDataUrl);

  if (placements.length === 0) return filled;
  return stampSignatures(filled, placements);
}

/**
 * Fills + stamps and triggers a browser download in a single call.
 */
export async function saveAndSign(
  pdfBytes: Uint8Array,
  values: Record<string, string>,
  fields: FieldInfo[],
  filename: string,
): Promise<void> {
  const savedBytes = await fillAndSign(pdfBytes, values, fields);
  const blob = new Blob([savedBytes as Uint8Array<ArrayBuffer>], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  downloadFile(url, filename);
  URL.revokeObjectURL(url);
}
