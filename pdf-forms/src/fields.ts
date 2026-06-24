import type { PDFField, PDFPage, PDFWidgetAnnotation } from "pdf-lib";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
} from "pdf-lib";
import { arToIso, isDateField } from "./dates";

export type FieldInfo =
  | ({
      type: "text" | "multiline" | "email";
      maxLength?: number;
    } & BaseFieldInfo)
  | ({
      type: "date" | "checkbox";
    } & BaseFieldInfo)
  | ({
      type: "radio";
      radioOnValue: string;
    } & BaseFieldInfo)
  | ({
      type: "dropdown";
      options: string[];
    } & BaseFieldInfo)
  | ({
      // Zona de firma: el valor es un PNG dataURL (firma dibujada), no un valor
      // de AcroField. Se estampa sobre el PDF al guardar (ver sign.ts).
      type: "signature";
    } & BaseFieldInfo);

type BaseFieldInfo = {
  id: string;
  name: string;
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  initialValue: string;
  required: boolean;
};

export function normalizeRadioValue(value: string): string {
  return value.replace(/^\/+/, "");
}

export function normalizeFieldName(fieldName: string): string {
  return fieldName
    .toLowerCase()
    .replace(/[\s\-.]/g, "_")
    .replace(/_+/g, "_");
}

function isEmailField(name: string): boolean {
  return name.toLowerCase().includes("email");
}

/**
 * Detecta una zona de firma por el nombre del campo. Matchea `firma`/`signature`
 * al inicio o tras un separador (`firma`, `firma_titular`, `firma-medico`), pero
 * NO dentro de otras palabras como `confirma`/`afirma`.
 */
function isSignatureField(name: string): boolean {
  return /(^|_)(firma|signature)/.test(normalizeFieldName(name));
}

type WidgetEntry = {
  widget: PDFWidgetAnnotation;
  widgetIndex: number;
  pageIndex: number;
};

/** Widgets of a field paired with the page they live on (skips orphan widgets). */
function widgetEntries(field: PDFField, pages: PDFPage[]): WidgetEntry[] {
  const entries: WidgetEntry[] = [];
  const widgets = field.acroField.getWidgets();
  for (let wi = 0; wi < widgets.length; wi++) {
    const widget = widgets[wi];
    if (!widget) continue;
    const pageRef = widget.P();
    const pageIndex = pages.findIndex(
      (p) => pageRef != null && p.ref.objectNumber === pageRef.objectNumber,
    );
    if (pageIndex === -1) continue;
    entries.push({ widget, widgetIndex: wi, pageIndex });
  }
  return entries;
}

export async function extractFieldInfo(pdfBytes: Uint8Array): Promise<{
  fields: FieldInfo[];
  pageHeights: number[];
}> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();
  const pageHeights = pages.map((p) => p.getHeight());
  const fields: FieldInfo[] = [];

  for (const field of form.getFields()) {
    const name = field.getName();
    const required = field.isRequired();
    const entries = widgetEntries(field, pages);
    const base = (e: WidgetEntry) => ({
      id: `${name}_${e.widgetIndex}`,
      name,
      pageIndex: e.pageIndex,
      rect: e.widget.getRectangle(),
      required,
    });

    // AcroField de firma dedicado, o campo de texto cuyo nombre indica firma
    // (p.ej. "firma_titular"): zona de firma dibujada.
    if (
      field instanceof PDFSignature ||
      (field instanceof PDFTextField && isSignatureField(name))
    ) {
      for (const e of entries) {
        fields.push({ ...base(e), type: "signature", initialValue: "" });
      }
    } else if (field instanceof PDFTextField) {
      const raw = field.getText() ?? "";
      const isDate = isDateField(name);
      const maxLength = field.getMaxLength();
      const type = isDate
        ? ("date" as const)
        : field.isMultiline()
          ? ("multiline" as const)
          : isEmailField(name)
            ? ("email" as const)
            : ("text" as const);
      for (const e of entries) {
        fields.push({
          ...base(e),
          type,
          initialValue: isDate ? arToIso(raw) : raw,
          ...(type === "text" || type === "multiline" || type === "email"
            ? { maxLength: maxLength }
            : {}),
        });
      }
    } else if (field instanceof PDFCheckBox) {
      for (const e of entries) {
        fields.push({
          ...base(e),
          type: "checkbox",
          initialValue: field.isChecked() ? "Yes" : "",
        });
      }
    } else if (field instanceof PDFRadioGroup) {
      const onValues = field.acroField.getOnValues();
      const selected = field.getSelected();
      for (const e of entries) {
        const onValue =
          onValues[e.widgetIndex]?.asString() ?? String(e.widgetIndex);
        fields.push({
          ...base(e),
          type: "radio",
          initialValue: selected === onValue ? onValue : "",
          radioOnValue: onValue,
        });
      }
    } else if (field instanceof PDFDropdown) {
      for (const e of entries) {
        fields.push({
          ...base(e),
          type: "dropdown",
          initialValue: field.getSelected()[0] ?? "",
          options: field.getOptions(),
        });
      }
    }
  }

  return { fields, pageHeights };
}
