<script lang="ts">
	import type { EditElement, PathElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState; preview?: boolean } = $props();
	const path = $derived(el as PathElement);

	// Points are absolute top-left-origin PDF points; render relative to the box.
	const rel = $derived(
		path.points.map((p) => ({ x: (p.x - path.x) * SCALE, y: (p.y - path.y) * SCALE }))
	);
	const w = $derived(Math.max(...rel.map((p) => p.x), 1));
	const h = $derived(Math.max(...rel.map((p) => p.y), 1));
	const d = $derived(
		rel.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + (path.closed ? ' Z' : '')
	);
	const stroke = $derived(path.strokeColor ?? { r: 0, g: 0, b: 0 });
	const strokeCss = $derived(
		`rgb(${Math.round(stroke.r * 255)} ${Math.round(stroke.g * 255)} ${Math.round(stroke.b * 255)})`
	);
	const fillCss = $derived(
		path.fillColor
			? `rgb(${Math.round(path.fillColor.r * 255)} ${Math.round(path.fillColor.g * 255)} ${Math.round(path.fillColor.b * 255)})`
			: 'none'
	);
	const sw = $derived((path.strokeWidth ?? 1) * SCALE);
	const op = $derived(path.opacity ?? 1);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute cursor-move {editor.selectedId === el.id ? 'ring-2 ring-blue-400' : ''}"
	style="left: {path.x * SCALE}px; top: {path.y * SCALE}px; width: {w}px; height: {h}px;"
	onpointerdown={(e) => editor.startDrag(e, path)}
>
	<svg
		class="pointer-events-none absolute inset-0 h-full w-full select-none overflow-visible"
		viewBox="0 0 {w} {h}"
		preserveAspectRatio="none"
	>
		<path
			{d}
			stroke={strokeCss}
			stroke-width={sw}
			fill={fillCss}
			opacity={op}
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
	</svg>
</div>
