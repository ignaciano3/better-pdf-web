import { describe, expect, it } from "vitest";
import type { FieldInfo } from "../fields";
import { buildInitialValues, createPatternResolver } from "../prefill";

const text = (name: string, initialValue = ""): FieldInfo => ({
  id: `${name}_0`,
  name,
  type: "text",
  pageIndex: 0,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  initialValue,
  required: false,
});

const radio = (name: string, radioOnValue: string): FieldInfo => ({
  id: `${name}_${radioOnValue}`,
  name,
  type: "radio",
  pageIndex: 0,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  initialValue: "",
  radioOnValue,
  required: false,
});

describe("createPatternResolver", () => {
  it("matches patterns as substrings of the normalized field name", () => {
    const resolver = createPatternResolver(
      { beneficiario_dni: (v: { dni: string }) => v.dni },
      { dni: "123" },
    );
    expect(resolver("Beneficiario.DNI")).toBe("123");
    expect(resolver("otra_cosa")).toBeUndefined();
  });

  it("skips empty results when skipEmpty is set", () => {
    const resolver = createPatternResolver(
      { email: (v: { email: string }) => v.email },
      { email: "" },
      { skipEmpty: true },
    );
    expect(resolver("contacto_email")).toBeUndefined();
  });

  it("matches more specific keys first (insertion order)", () => {
    const resolver = createPatternResolver(
      {
        cuil_2: (v: { cuil: string }) => v.cuil.slice(2, 10),
        cuil: (v: { cuil: string }) => v.cuil,
      },
      { cuil: "20123456789" },
    );
    expect(resolver("beneficiario_cuil_2")).toBe("12345678");
    expect(resolver("beneficiario_cuil")).toBe("20123456789");
  });
});

describe("buildInitialValues", () => {
  it("first resolver returning a defined value wins; empty string is a result", () => {
    const values = buildInitialValues(
      [text("contacto_email", "pdf@default.com")],
      [() => undefined, (name) => (name.includes("email") ? "" : undefined)],
    );
    expect(values.contacto_email).toBe("");
  });

  it("falls back to the PDF initial value when no resolver matches", () => {
    const values = buildInitialValues(
      [text("campo_libre", "hola")],
      [() => undefined],
    );
    expect(values.campo_libre).toBe("hola");
  });

  it("does not overwrite a radio group value already resolved", () => {
    const values = buildInitialValues(
      [radio("tipo", "Titular"), radio("tipo", "Familiar")],
      [() => "Titular"],
    );
    expect(values.tipo).toBe("Titular");
  });

  it("ignores falsy resolver results for radios and keeps the PDF default", () => {
    const fields = [radio("tipo", "Titular")];
    fields[0]!.initialValue = "Titular";
    const values = buildInitialValues(fields, [() => ""]);
    expect(values.tipo).toBe("Titular");
  });
});
