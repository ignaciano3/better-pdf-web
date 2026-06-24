import { useState } from "react";
import { SignaturePad } from "../signature-pad/SignaturePad";
import { CloseIcon, DrawIcon } from "./icons";
import styles from "./PdfFormViewer.module.css";

export type SignatureFieldProps = {
  value: string;
  required: boolean;
  style: { left: number; top: number; width: number; height: number };
  onChange: (value: string) => void;
  onRemove?: () => void;
};

/** Zona de firma: botón "Firmar" → modal con SignaturePad; o preview del PNG. */
export function SignatureField({
  value,
  required,
  style,
  onChange,
  onRemove,
}: SignatureFieldProps) {
  const [open, setOpen] = useState(false);
  const reqClass = required ? ` ${styles.fieldRequired}` : "";

  return (
    <>
      {onRemove && (
        <button
          type="button"
          className={styles.signatureRemove}
          style={{ left: style.left + style.width - 10, top: style.top - 10 }}
          onClick={onRemove}
          title="Quitar zona de firma"
        >
          <CloseIcon />
        </button>
      )}
      {value ? (
        <button
          type="button"
          className={styles.signaturePreview}
          style={style}
          onClick={() => setOpen(true)}
          title="Tocar para rehacer la firma"
        >
          <img src={value} alt="Firma" className={styles.signatureImg} />
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.signatureButton}${reqClass}`}
          style={style}
          onClick={() => setOpen(true)}
        >
          <DrawIcon />
          Firmar
        </button>
      )}
      {open && (
        <div className={styles.signatureModalOverlay}>
          <div className={styles.signatureModal}>
            <SignaturePad
              onDone={(dataUrl) => {
                onChange(dataUrl);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
              onClear={() => onChange("")}
              initialImage={value || undefined}
            />
          </div>
        </div>
      )}
    </>
  );
}
