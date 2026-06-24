const DATE_PATTERNS = [
  "fecha",
  "nacimiento",
  "vencimiento",
  "ingreso",
  "egreso",
];

export function isDateField(name: string): boolean {
  const n = name.toLowerCase();
  return DATE_PATTERNS.some((p) => n.includes(p));
}

/** Convert existing Argentine date value to ISO for the date input.
 DD/MM/YYYY → YYYY-MM-DD (for <input type="date">)
**/
export function arToIso(value: string): string {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo?.padStart(2, "0")}-${d?.padStart(2, "0")}`;
}

// YYYY-MM-DD → DD/MM/YYYY (for saving to PDF)
export function isoToAr(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}
