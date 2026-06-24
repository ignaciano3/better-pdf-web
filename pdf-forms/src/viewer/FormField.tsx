import type { FieldInfo } from "../fields";
import { normalizeRadioValue } from "../fields";
import type { CssRect } from "./coords";
import styles from "./PdfFormViewer.module.css";
import { SignatureField } from "./SignatureField";

type Props = {
  field: FieldInfo;
  style: CssRect;
  value: string;
  onChange: (name: string, value: string) => void;
  onRemoveSignature?: (id: string) => void;
};

export function FormField({
  field,
  style,
  value,
  onChange,
  onRemoveSignature,
}: Props) {
  const reqClass = field.required ? ` ${styles.fieldRequired}` : "";

  switch (field.type) {
    case "date":
      return (
        <input
          name={field.name}
          aria-label={field.name}
          type="date"
          className={`${styles.fieldInput}${reqClass}`}
          style={style}
          value={value}
          required={field.required}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      );
    case "multiline":
      return (
        <textarea
          name={field.name}
          aria-label={field.name}
          className={`${styles.fieldInput}${reqClass}`}
          style={style}
          value={value}
          required={field.required}
          maxLength={field.maxLength}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      );
    case "dropdown":
      return (
        <select
          name={field.name}
          className={`${styles.fieldInput}${reqClass}`}
          style={style}
          required={field.required}
          value={value}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          <option value="" disabled>
            -- Seleccionar --
          </option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "checkbox":
      return (
        <input
          name={field.name}
          aria-label={field.name}
          type="checkbox"
          className={`${styles.fieldCheckbox}${reqClass}`}
          style={style}
          checked={!!value}
          required={field.required}
          onChange={(e) => onChange(field.name, e.target.checked ? "Yes" : "")}
        />
      );
    case "radio": {
      const radioValue = normalizeRadioValue(field.radioOnValue);
      return (
        <input
          type="radio"
          aria-label={field.name}
          className={`${styles.fieldRadio}${reqClass}`}
          style={style}
          name={field.name}
          value={radioValue}
          required={field.required}
          checked={normalizeRadioValue(value) === radioValue}
          onChange={() => onChange(field.name, radioValue)}
        />
      );
    }
    case "signature":
      return (
        <SignatureField
          value={value}
          required={field.required}
          style={style}
          onChange={(v) => onChange(field.name, v)}
          onRemove={
            onRemoveSignature ? () => onRemoveSignature(field.id) : undefined
          }
        />
      );
    case "email":
      return (
        <input
          type="email"
          name={field.name}
          aria-label={field.name}
          className={`${styles.fieldInput}${reqClass}`}
          style={style}
          maxLength={field.maxLength}
          value={value}
          required={field.required}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      );
    default:
      return (
        <input
          type="text"
          name={field.name}
          aria-label={field.name}
          className={`${styles.fieldInput}${reqClass}`}
          style={style}
          maxLength={field.maxLength}
          value={value}
          required={field.required}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      );
  }
}
