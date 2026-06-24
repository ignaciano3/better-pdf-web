import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldInfo } from "../fields";
import { PdfFormViewer, type PdfFormViewerRef } from "../viewer/PdfFormViewer";

const { mockGetDocument } = vi.hoisted(() => {
  const renderTask = {
    promise: Promise.resolve(),
    cancel: vi.fn(),
  };

  const fakePage = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: vi.fn(() => renderTask),
  };

  const fakePdfDoc = {
    numPages: 1,
    getPage: vi.fn(async () => fakePage),
  };

  return {
    mockGetDocument: vi.fn(() => ({
      promise: Promise.resolve(fakePdfDoc),
      destroy: vi.fn(),
    })),
  };
});

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: mockGetDocument,
}));

const dropdownField: FieldInfo = {
  id: "cobertura.tipo_0",
  name: "cobertura.tipo",
  type: "dropdown",
  pageIndex: 0,
  rect: { x: 100, y: 200, width: 150, height: 20 },
  initialValue: "",
  options: ["Opción A", "Opción B", "Opción C"],
  required: false,
};

const fields: FieldInfo[] = [
  {
    id: "beneficiario.apellidos_nombres_0",
    name: "beneficiario.apellidos_nombres",
    type: "text",
    pageIndex: 0,
    rect: { x: 188, y: 185.6, width: 347, height: 14.9 },
    initialValue: "Juan Pérez",
    required: false,
  },
  {
    id: "discapacidad.tipo_beneficiario_0",
    name: "discapacidad.tipo_beneficiario",
    type: "radio",
    pageIndex: 0,
    rect: { x: 92.1, y: 233.4, width: 9.1, height: 9.1 },
    initialValue: "",
    radioOnValue: "/Titular",
    required: false,
  },
  {
    id: "discapacidad.tipo_beneficiario_1",
    name: "discapacidad.tipo_beneficiario",
    type: "radio",
    pageIndex: 0,
    rect: { x: 139.6, y: 233.4, width: 9.1, height: 9.1 },
    initialValue: "",
    radioOnValue: "/Familiar",
    required: false,
  },
  {
    id: "domicilio.codigo_postal_0",
    name: "domicilio.codigo_postal",
    type: "text",
    pageIndex: 0,
    rect: { x: 478, y: 278.3, width: 57, height: 14.8 },
    initialValue: "1609",
    required: false,
  },
];

describe("PdfFormViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
  });

  it("renders the real Discapacidad fields and normalizes the selected radio value", async () => {
    const viewerRef = createRef<PdfFormViewerRef>();

    render(
      <PdfFormViewer
        ref={viewerRef}
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={fields}
        pageHeights={[800]}
        initialValues={{
          "beneficiario.apellidos_nombres": "Juan Pérez",
          "discapacidad.tipo_beneficiario": "/Familiar",
          "domicilio.codigo_postal": "1609",
        }}
      />,
    );

    await screen.findByDisplayValue("Juan Pérez");

    const familiarRadio = await screen.findByDisplayValue("Familiar");
    expect(familiarRadio).toBeChecked();

    await userEvent.click(familiarRadio);

    await waitFor(() => {
      expect(viewerRef.current?.getValues()).toEqual(
        expect.objectContaining({
          "beneficiario.apellidos_nombres": "Juan Pérez",
          "discapacidad.tipo_beneficiario": "Familiar",
          "domicilio.codigo_postal": "1609",
        }),
      );
    });
  });

  it("renders a dropdown field and reflects the selected value in getValues", async () => {
    const viewerRef = createRef<PdfFormViewerRef>();

    render(
      <PdfFormViewer
        ref={viewerRef}
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={[dropdownField]}
        pageHeights={[800]}
        initialValues={{ "cobertura.tipo": "" }}
      />,
    );

    const select = await screen.findByRole("combobox");
    await userEvent.selectOptions(select, "Opción B");

    await waitFor(() => {
      expect(viewerRef.current?.getValues()["cobertura.tipo"]).toBe("Opción B");
    });
  });

  it("keeps the radio value clean when the user switches from Titular to Familiar", async () => {
    const viewerRef = createRef<PdfFormViewerRef>();

    render(
      <PdfFormViewer
        ref={viewerRef}
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={fields}
        pageHeights={[800]}
        initialValues={{
          "beneficiario.apellidos_nombres": "Juan Pérez",
          "discapacidad.tipo_beneficiario": "/Titular",
          "domicilio.codigo_postal": "1609",
        }}
      />,
    );

    await screen.findByDisplayValue("Juan Pérez");

    await userEvent.click(screen.getByDisplayValue("Familiar"));

    await waitFor(() => {
      expect(
        viewerRef.current?.getValues()["discapacidad.tipo_beneficiario"],
      ).toBe("Familiar");
    });
  });
});

describe("PdfFormViewer — signature fields", () => {
  const FAKE_SIGNATURE = "data:image/png;base64,FAKE_SIGNATURE_DATA";

  const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
  const originalReleasePointerCapture =
    HTMLElement.prototype.releasePointerCapture;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      lineCap: "round",
      lineJoin: "round",
      strokeStyle: "#000",
      lineWidth: 2,
    } as unknown as CanvasRenderingContext2D);

    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      FAKE_SIGNATURE,
    );

    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
    HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
  });

  const signatureField: FieldInfo = {
    id: "firma.titular_0",
    name: "firma.titular",
    type: "signature",
    pageIndex: 0,
    rect: { x: 50, y: 100, width: 200, height: 80 },
    initialValue: "",
    required: false,
  };

  it("renders a Firmar button for a signature acrofield", async () => {
    render(
      <PdfFormViewer
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={[signatureField]}
        pageHeights={[800]}
        initialValues={{ "firma.titular": "" }}
      />,
    );

    await screen.findByRole("button", { name: /Firmar/i });
  });

  it("opens the SignaturePad modal when Firmar is clicked, and Listo is disabled until ink is drawn", async () => {
    render(
      <PdfFormViewer
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={[signatureField]}
        pageHeights={[800]}
        initialValues={{ "firma.titular": "" }}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Firmar/i }),
    );

    await screen.findByText(/Dibujá tu firma/i);
    expect(screen.getByRole("button", { name: /Listo/i })).toBeDisabled();
  });

  it("saves the signature dataURL in getValues and shows a preview after drawing and confirming", async () => {
    const viewerRef = createRef<PdfFormViewerRef>();

    render(
      <PdfFormViewer
        ref={viewerRef}
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={[signatureField]}
        pageHeights={[800]}
        initialValues={{ "firma.titular": "" }}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Firmar/i }),
    );
    await screen.findByText(/Dibujá tu firma/i);

    // PDF page canvas is first; SignaturePad canvas is second.
    const canvases = document.querySelectorAll("canvas");
    expect(canvases).toHaveLength(2);
    const padCanvas = canvases[1] as HTMLCanvasElement;

    fireEvent.pointerDown(padCanvas, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(padCanvas, {
      pointerId: 1,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerUp(padCanvas, { pointerId: 1, clientX: 60, clientY: 60 });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Listo/i })).not.toBeDisabled();
    });

    await userEvent.click(screen.getByRole("button", { name: /Listo/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Dibujá tu firma/i)).not.toBeInTheDocument();
    });

    expect(viewerRef.current?.getValues()["firma.titular"]).toBe(
      FAKE_SIGNATURE,
    );
    expect(screen.getByAltText("Firma")).toBeInTheDocument();
  });

  /** Draws on the pad canvas and clicks Listo — reusable across tests. */
  async function drawAndConfirm() {
    const canvases = document.querySelectorAll("canvas");
    expect(canvases).toHaveLength(2);
    const padCanvas = canvases[1] as HTMLCanvasElement;
    fireEvent.pointerDown(padCanvas, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(padCanvas, {
      pointerId: 1,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerUp(padCanvas, { pointerId: 1, clientX: 60, clientY: 60 });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Listo/i })).not.toBeDisabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: /Listo/i }));
    await waitFor(() =>
      expect(screen.queryByText(/Dibujá tu firma/i)).not.toBeInTheDocument(),
    );
  }

  it("keeps the original signature when the preview is reopened and then cancelled", async () => {
    const viewerRef = createRef<PdfFormViewerRef>();

    render(
      <PdfFormViewer
        ref={viewerRef}
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={[signatureField]}
        pageHeights={[800]}
        initialValues={{ "firma.titular": "" }}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Firmar/i }),
    );
    await screen.findByText(/Dibujá tu firma/i);
    await drawAndConfirm();

    // Reopen by clicking the preview image.
    await userEvent.click(screen.getByAltText("Firma"));
    await screen.findByText(/Dibujá tu firma/i);

    await userEvent.click(screen.getByRole("button", { name: /Cancelar/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Dibujá tu firma/i)).not.toBeInTheDocument(),
    );

    // Original signature is unchanged.
    expect(viewerRef.current?.getValues()["firma.titular"]).toBe(
      FAKE_SIGNATURE,
    );
    expect(screen.getByAltText("Firma")).toBeInTheDocument();
  });

  it("replaces the signature when the preview is reopened and a new one is drawn", async () => {
    const SECOND_SIGNATURE = "data:image/png;base64,SECOND_FAKE";
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValueOnce(FAKE_SIGNATURE)
      .mockReturnValue(SECOND_SIGNATURE);

    const viewerRef = createRef<PdfFormViewerRef>();

    render(
      <PdfFormViewer
        ref={viewerRef}
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={[signatureField]}
        pageHeights={[800]}
        initialValues={{ "firma.titular": "" }}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Firmar/i }),
    );
    await screen.findByText(/Dibujá tu firma/i);
    await drawAndConfirm();
    expect(viewerRef.current?.getValues()["firma.titular"]).toBe(
      FAKE_SIGNATURE,
    );

    // Reopen and draw a new signature.
    await userEvent.click(screen.getByAltText("Firma"));
    await screen.findByText(/Dibujá tu firma/i);
    await drawAndConfirm();

    expect(viewerRef.current?.getValues()["firma.titular"]).toBe(
      SECOND_SIGNATURE,
    );
  });

  it("clears a previously confirmed signature when Limpiar is clicked while reviewing it", async () => {
    const viewerRef = createRef<PdfFormViewerRef>();

    render(
      <PdfFormViewer
        ref={viewerRef}
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={[signatureField]}
        pageHeights={[800]}
        initialValues={{ "firma.titular": "" }}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Firmar/i }),
    );
    await screen.findByText(/Dibujá tu firma/i);
    await drawAndConfirm();
    expect(viewerRef.current?.getValues()["firma.titular"]).toBe(
      FAKE_SIGNATURE,
    );

    // Reopen the modal via the preview image.
    await userEvent.click(screen.getByAltText("Firma"));
    await screen.findByText(/Dibujá tu firma/i);

    // Limpiar should clear both the canvas and the saved signature.
    await userEvent.click(screen.getByRole("button", { name: /Limpiar/i }));
    expect(viewerRef.current?.getValues()["firma.titular"]).toBe("");

    // Dismiss without drawing a new one.
    await userEvent.click(screen.getByRole("button", { name: /Cancelar/i }));

    // Preview is gone; Firmar button is back.
    await waitFor(() =>
      expect(screen.queryByAltText("Firma")).not.toBeInTheDocument(),
    );
    await screen.findByRole("button", { name: /Firmar/i });
  });

  it("re-disables Listo and discards the ink when Limpiar is clicked after drawing", async () => {
    render(
      <PdfFormViewer
        pdfBytes={new Uint8Array([1, 2, 3])}
        fields={[signatureField]}
        pageHeights={[800]}
        initialValues={{ "firma.titular": "" }}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Firmar/i }),
    );
    await screen.findByText(/Dibujá tu firma/i);

    const canvases = document.querySelectorAll("canvas");
    expect(canvases).toHaveLength(2);
    const padCanvas = canvases[1] as HTMLCanvasElement;

    // Draw so that Listo becomes enabled.
    fireEvent.pointerDown(padCanvas, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(padCanvas, {
      pointerId: 1,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerUp(padCanvas, { pointerId: 1, clientX: 60, clientY: 60 });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Listo/i })).not.toBeDisabled();
    });

    // Clear the drawing.
    await userEvent.click(screen.getByRole("button", { name: /Limpiar/i }));

    // Listo must be disabled again — no ink, nothing to confirm.
    expect(screen.getByRole("button", { name: /Listo/i })).toBeDisabled();
  });
});
