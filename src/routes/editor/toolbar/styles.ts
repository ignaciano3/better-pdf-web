// Shared presentation for the toolbar's insert-tool sections, so each section
// component (Shapes / Content / Fields) renders an identical label + button look.

/** Small uppercase label shown beside a section's button group. */
export const sectionLabel =
	'shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500';

/** Wrapper around a section's bordered button group. Wraps its buttons onto more
 * rows when the section is squeezed, so a long group (e.g. Fields) never spills
 * over the neighbouring zone. */
export const sectionGroup =
	'flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 p-1';

/** A single tool button — highlighted while its tool is the active one. The
 * active state carries a non-color cue (bolder weight) on top of the blue fill,
 * so the selection reads for color-blind users too; pair with `aria-pressed`. */
export function toolClass(active: boolean): string {
	return active
		? 'shrink-0 rounded bg-blue-600 px-2.5 py-1.5 text-sm font-bold text-white'
		: 'shrink-0 rounded px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100';
}
