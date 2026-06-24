import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";
import { isDateField, isoToAr } from "./dates";
import { downloadFile } from "./download";
import { normalizeRadioValue } from "./fields";

/**
 * Some source PDFs store the leading slash of the font operator in a field's
 * `/DA` as an octal escape (`\057Helv 10 Tf` instead of `/Helv 10 Tf`).
 * pdf-lib's font-size regex only matches a literal `/`, so it fails to read the
 * size, treats the field as auto-size, and on save grows the text large enough
 * to fill the whole box (e.g. a textarea rendering at size 63). Rewriting the
 * escape back to a literal slash preserves the configured font size.
 */
function normalizeDefaultAppearance(field: PDFTextField): void {
  const fix = (da: string) => da.replace(/\\057/g, "/");
  const fieldDa = field.acroField.getDefaultAppearance();
  if (fieldDa?.includes("\\057")) {
    field.acroField.setDefaultAppearance(fix(fieldDa));
  }
  for (const widget of field.acroField.getWidgets()) {
    const widgetDa = widget.getDefaultAppearance();
    if (widgetDa?.includes("\\057")) {
      widget.setDefaultAppearance(fix(widgetDa));
    }
  }
}

export async function fillPdfBytes(
  pdfBytes: Uint8Array,
  values: Record<string, string>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  for (const field of form.getFields()) {
    const value = values[field.getName()];
    if (value === undefined) continue;

    if (field instanceof PDFTextField) {
      normalizeDefaultAppearance(field);
      field.setText(isDateField(field.getName()) ? isoToAr(value) : value);
    } else if (field instanceof PDFCheckBox) {
      if (value) field.check();
      else field.uncheck();
    } else if (field instanceof PDFRadioGroup) {
      const normalized = normalizeRadioValue(value);
      if (normalized) field.select(normalized);
    } else if (field instanceof PDFDropdown) {
      if (value) field.select(value);
    }
  }

  return pdfDoc.save();
}

export async function saveWithValues(
  pdfBytes: Uint8Array,
  values: Record<string, string>,
  filename: string,
): Promise<void> {
  const savedBytes = await fillPdfBytes(pdfBytes, values);
  const blob = new Blob([savedBytes as Uint8Array<ArrayBuffer>], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  downloadFile(url, filename);
  URL.revokeObjectURL(url);
}
