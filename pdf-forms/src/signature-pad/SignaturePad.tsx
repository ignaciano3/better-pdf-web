import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, EraserIcon } from "../viewer/icons";
import styles from "./SignaturePad.module.css";

type Props = {
  /** Devuelve la firma como PNG dataURL con fondo transparente. */
  onDone: (pngDataUrl: string) => void;
  onCancel: () => void;
  /** Llamado cuando el usuario limpia el canvas — permite al padre borrar una
   *  firma previamente confirmada. */
  onClear?: () => void;
  /** Si se provee, pre-carga una firma existente en el canvas al abrir el pad. */
  initialImage?: string;
  width?: number;
  height?: number;
};

const STROKE_COLOR = "#0f172a";
const STROKE_WIDTH = 2.5;

/**
 * Pad de firma sobre canvas. Usa Pointer Events (mouse + touch + lápiz en un
 * solo handler). Fondo transparente → el PNG resultante deja ver la línea/zona
 * del PDF cuando se estampa. Devuelve `canvas.toDataURL("image/png")`.
 */
export function SignaturePad({
  onDone,
  onCancel,
  onClear,
  initialImage,
  width = 500,
  height = 200,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Escala por devicePixelRatio para trazo nítido en pantallas HiDPI.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;

    if (initialImage) {
      setHasInk(true);
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = initialImage;
    }
  }, [width, height, initialImage]);

  const pos = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * width,
        y: ((e.clientY - rect.top) / rect.height) * height,
      };
    },
    [width, height],
  );

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const from = last.current;
    if (!ctx || !from) return;
    const to = pos(e);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    last.current = to;
    if (!hasInk) setHasInk(true);
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onClear?.();
  };

  const done = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    onDone(canvas.toDataURL("image/png"));
  };

  return (
    <div className={styles.pad}>
      <p className={styles.hint}>Dibujá tu firma dentro del recuadro</p>
      <div className={styles.canvasWrap} style={{ width, height }}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ width, height, touchAction: "none" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        <span className={styles.baseline} />
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.ghostBtn} onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className={styles.ghostBtn} onClick={clear}>
          <EraserIcon />
          Limpiar
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={done}
          disabled={!hasInk}
        >
          <CheckIcon />
          Listo
        </button>
      </div>
    </div>
  );
}
