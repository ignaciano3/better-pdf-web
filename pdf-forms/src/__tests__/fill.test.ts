import type { PDFTextField } from "pdf-lib";
import { PDFDocument, PDFDropdown } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fillPdfBytes } from "../index";

async function makePdfWithDropdown(
  fieldName: string,
  options: string[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();
  const dropdown = form.createDropdown(fieldName);
  dropdown.addOptions(options);
  dropdown.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  return doc.save();
}

/**
 * Builds a PDF whose multiline text field has its `/DA` font slash written as an
 * octal escape (`\057Helv 10 Tf` instead of `/Helv 10 Tf`) — the exact shape
 * found in the real OSFATUN form PDFs, which makes pdf-lib fail to read the font
 * size and balloon the text to fill the box on save.
 */
async function makePdfWithEscapedSlashMultiline(
  fieldName: string,
  fontSize: number,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();
  const field = form.createTextField(fieldName);
  field.enableMultiline();
  field.addToPage(page, { x: 50, y: 400, width: 300, height: 200 });
  const escapedDa = `\\057Helv ${fontSize} Tf 0 g`;
  field.acroField.setDefaultAppearance(escapedDa);
  for (const widget of field.acroField.getWidgets()) {
    widget.setDefaultAppearance(escapedDa);
  }
  return doc.save();
}

function fontSizeFromDA(da: string | undefined): number | undefined {
  const m = da ? /\/\S+\s+(\d*\.?\d+)\s+Tf/.exec(da) : null;
  const captured = m?.[1];
  return captured != null ? Number.parseFloat(captured) : undefined;
}

describe("fillPdfBytes", () => {
  it("writes a dropdown value into the PDF", async () => {
    const options = ["Opción A", "Opción B", "Opción C"];
    const original = await makePdfWithDropdown("cobertura.tipo", options);

    const filled = await fillPdfBytes(original, {
      "cobertura.tipo": "Opción B",
    });

    const reloaded = await PDFDocument.load(filled);
    const field = reloaded.getForm().getField("cobertura.tipo");
    expect(field).toBeInstanceOf(PDFDropdown);
    expect((field as PDFDropdown).getSelected()).toEqual(["Opción B"]);
  });

  it("leaves the dropdown unchanged when value is empty string", async () => {
    const options = ["Opción A", "Opción B"];
    const original = await makePdfWithDropdown("cobertura.tipo", options);

    const filled = await fillPdfBytes(original, { "cobertura.tipo": "" });

    const reloaded = await PDFDocument.load(filled);
    const field = reloaded.getForm().getField("cobertura.tipo") as PDFDropdown;
    expect(field.getSelected()).toEqual([]);
  });

  it("preserves the configured font size on a multiline field with an octal-escaped slash in its /DA", async () => {
    const original = await makePdfWithEscapedSlashMultiline(
      "observaciones",
      10,
    );

    const filled = await fillPdfBytes(original, {
      observaciones: "Texto corto.",
    });

    const reloaded = await PDFDocument.load(filled);
    const field = reloaded.getForm().getField("observaciones") as PDFTextField;
    // Without the fix, pdf-lib auto-sizes the text and the size balloons (e.g. 63).
    expect(fontSizeFromDA(field.acroField.getDefaultAppearance())).toBe(10);
  });
});
