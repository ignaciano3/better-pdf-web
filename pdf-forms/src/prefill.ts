import { type FieldInfo, normalizeFieldName } from "./fields";

/** Resolves a prefill value for an AcroField name; `undefined` = no opinion. */
export type PrefillResolver = (fieldName: string) => string | undefined;

/**
 * Builds a resolver from a pattern → getter map. Patterns are matched as
 * substrings of the normalized field name, in insertion order, so more
 * specific keys must come first (e.g. `cuil_2` before `cuil`, otherwise the
 * full-CUIL key would swallow the part fields).
 */
export function createPatternResolver<T>(
  map: Record<string, (value: T) => string>,
  value: T,
  options?: { skipEmpty?: boolean },
): PrefillResolver {
  return (fieldName) => {
    const normalized = normalizeFieldName(fieldName);
    for (const [pattern, getter] of Object.entries(map)) {
      if (!normalized.includes(pattern)) continue;
      const result = getter(value);
      if (options?.skipEmpty && !result) return undefined;
      return result;
    }
    return undefined;
  };
}

function resolveFirst(
  resolvers: PrefillResolver[],
  fieldName: string,
): string | undefined {
  for (const resolver of resolvers) {
    const value = resolver(fieldName);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function buildInitialValues(
  fields: FieldInfo[],
  resolvers: PrefillResolver[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === "checkbox" || field.type === "radio") {
      // Radio groups share one key across several widgets; don't overwrite a
      // value already resolved for the group.
      if (result[field.name]) continue;
      // A radio whose options encode known data (e.g. Titular/Familiar) can be
      // prefilled — the resolved value is the selected option's name. Falsy
      // results are ignored: an empty string can't select a radio option.
      if (field.type === "radio") {
        const mapped = resolveFirst(resolvers, field.name);
        if (mapped) {
          result[field.name] = mapped;
          continue;
        }
      }
      result[field.name] = field.initialValue;
      continue;
    }
    // First resolver with a defined result wins (empty string included);
    // otherwise keep whatever value the PDF already carried.
    result[field.name] =
      resolveFirst(resolvers, field.name) ?? field.initialValue;
  }
  return result;
}
