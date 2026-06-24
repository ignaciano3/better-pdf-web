import { type PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { FieldInfo } from "../fields";
import { fillAndSign } from "../sign";

// Minimal 1×1 transparent PNG — valid header, passes pdf-lib's embedPng parser.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

async function makePdfWithTextField(fieldName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();
  const field = form.createTextField(fieldName);
  field.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  return doc.save();
}

// A text field whose name matches isSignatureField() — treated as a signature
// zone by extractFieldInfo, and its widget appearance is set by stampSignatures.
async function makePdfWithSignatureTextField(
  fieldName: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();
  const field = form.createTextField(fieldName);
  field.addToPage(page, { x: 50, y: 100, width: 200, height: 80 });
  return doc.save();
}

function textField(name: string): FieldInfo {
  return {
    id: `${name}_0`,
    name,
    type: "text",
    pageIndex: 0,
    rect: { x: 50, y: 700, width: 200, height: 20 },
    initialValue: "",
    required: false,
  };
}

function signatureField(name: string): FieldInfo {
  return {
    id: `${name}_0`,
    name,
    type: "signature",
    pageIndex: 0,
    rect: { x: 50, y: 100, width: 200, height: 80 },
    initialValue: "",
    required: false,
  };
}

describe("fillAndSign", () => {
  it("fills text AcroFields while ignoring signature fields", async () => {
    const original = await makePdfWithTextField("nombre");
    const fields = [textField("nombre"), signatureField("firma.titular")];

    const result = await fillAndSign(
      original,
      { nombre: "Juan García", "firma.titular": TINY_PNG },
      fields,
    );

    const reloaded = await PDFDocument.load(result);
    expect(reloaded.getForm().getTextField("nombre").getText()).toBe(
      "Juan García",
    );
  });

  it("embeds the PNG in the output, making the signed PDF larger than the unsigned one", async () => {
    const original = await makePdfWithTextField("nombre");
    const fields = [textField("nombre"), signatureField("firma.titular")];

    const withSignature = await fillAndSign(
      original,
      { nombre: "Juan García", "firma.titular": TINY_PNG },
      fields,
    );

    const withoutSignature = await fillAndSign(
      original,
      { nombre: "Juan García", "firma.titular": "" },
      fields,
    );

    expect(withSignature.length).toBeGreaterThan(withoutSignature.length);
  });

  it("returns a valid PDF unchanged when no signature value is provided", async () => {
    const original = await makePdfWithTextField("nombre");
    const fields = [signatureField("firma.titular")];

    const result = await fillAndSign(original, {}, fields);

    const reloaded = await PDFDocument.load(result);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("sets the widget Normal appearance (/AP /N) for AcroField-backed signature fields", async () => {
    // "firma_titular" matches isSignatureField() and exists as an AcroField,
    // so stampSignatures should embed the PNG in the widget rather than the page.
    const original = await makePdfWithSignatureTextField("firma_titular");
    const fields = [signatureField("firma_titular")];

    const result = await fillAndSign(
      original,
      { firma_titular: TINY_PNG },
      fields,
    );

    const reloaded = await PDFDocument.load(result);
    const widget = reloaded
      .getForm()
      .getTextField("firma_titular")
      .acroField.getWidgets()[0]!;

    const ap = widget.dict.lookup(PDFName.of("AP")) as PDFDict;
    expect(ap).not.toBeNull();
    expect(ap.lookup(PDFName.of("N"))).not.toBeNull();
  });
});
