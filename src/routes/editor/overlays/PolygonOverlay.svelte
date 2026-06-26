<script lang="ts">
	import type { EditElement, PolygonElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState; preview?: boolean } = $props();
	const poly = $derived(el as PolygonElement);
	const isDraft = $derived(editor.polygonDraftId === el.id);

	const rel = $derived(
		poly.points.map((p) => ({ x: (p.x - poly.x) * SCALE, y: (p.y - poly.y) * SCALE }))
	);
	const w = $derived(Math.max(...rel.map((p) => p.x), 1));
	const h = $derived(Math.max(...rel.map((p) => p.y), 1));
	const pointsAttr = $derived(rel.map((p) => `${p.x},${p.y}`).join(' '));
	const stroke = $derived(poly.strokeColor ?? { r: 0, g: 0, b: 0 });
	const strokeCss = $derived(
		`rgb(${Math.round(stroke.r * 255)} ${Math.round(stroke.g * 255)} ${Math.round(stroke.b * 255)})`
	);
	const fillCss = $derived(
		poly.fillColor
			? `rgb(${Math.round(poly.fillColor.r * 255)} ${Math.round(poly.fillColor.g * 255)} ${Math.round(poly.fillColor.b * 255)})`
			: 'none'
	);
	const sw = $derived((poly.strokeWidth ?? 1) * SCALE);
	const op = $derived(poly.opacity ?? 1);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute {isDraft ? '' : 'cursor-move'} {editor.selectedId === el.id
		? 'ring-2 ring-blue-400'
		: ''}"
	style="left: {poly.x * SCALE}px; top: {poly.y * SCALE}px; width: {w}px; height: {h}px;"
	onpointerdown={(e) => {
		// While drafting, let the page handle clicks (add vertex); don't drag.
		if (!isDraft) editor.startDrag(e, poly);
	}}
	style:pointer-events={isDraft ? 'none' : 'auto'}
>
	<svg
		class="pointer-events-none absolute inset-0 h-full w-full select-none overflow-visible"
		viewBox="0 0 {w} {h}"
		preserveAspectRatio="none"
	>
		{#if poly.closed && !isDraft}
			<polygon
				points={pointsAttr}
				stroke={strokeCss}
				stroke-width={sw}
				fill={fillCss}
				opacity={op}
			/>
		{:else}
			<polyline
				points={pointsAttr}
				stroke={strokeCss}
				stroke-width={sw}
				fill="none"
				opacity={op}
				stroke-dasharray={isDraft ? '4 3' : undefined}
			/>
		{/if}
	</svg>
</div>
