<script lang="ts">
	import type { EditElement, ShapeElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState; preview?: boolean } = $props();
	const shape = $derived(el as ShapeElement);

	const w = $derived(Math.max(shape.width, 0) * SCALE);
	const h = $derived(Math.max(shape.height, 0) * SCALE);
	const stroke = $derived(shape.strokeColor ?? { r: 0, g: 0, b: 0 });
	const strokeCss = $derived(
		`rgb(${Math.round(stroke.r * 255)} ${Math.round(stroke.g * 255)} ${Math.round(stroke.b * 255)})`
	);
	const fillCss = $derived(
		shape.fillColor
			? `rgb(${Math.round(shape.fillColor.r * 255)} ${Math.round(shape.fillColor.g * 255)} ${Math.round(shape.fillColor.b * 255)})`
			: 'none'
	);
	const sw = $derived((shape.strokeWidth ?? 1) * SCALE);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute cursor-move {editor.selectedId === el.id ? 'ring-2 ring-blue-400' : ''}"
	style="left: {shape.x * SCALE}px; top: {shape.y * SCALE}px; width: {w}px; height: {h}px;"
	onpointerdown={(e) => editor.startDrag(e, shape)}
>
	<svg
		class="pointer-events-none absolute inset-0 h-full w-full select-none overflow-visible"
		viewBox="0 0 {Math.max(w, 1)} {Math.max(h, 1)}"
		preserveAspectRatio="none"
	>
		{#if shape.shape === 'line'}
			<line
				x1={shape.antidiagonal ? w : 0}
				y1="0"
				x2={shape.antidiagonal ? 0 : w}
				y2={h}
				stroke={strokeCss}
				stroke-width={sw}
			/>
		{:else if shape.shape === 'rectangle'}
			<rect
				x={sw / 2}
				y={sw / 2}
				width={Math.max(w - sw, 0)}
				height={Math.max(h - sw, 0)}
				stroke={strokeCss}
				stroke-width={sw}
				fill={fillCss}
			/>
		{:else}
			<ellipse
				cx={w / 2}
				cy={h / 2}
				rx={Math.max(w / 2 - sw / 2, 0)}
				ry={Math.max(h / 2 - sw / 2, 0)}
				stroke={strokeCss}
				stroke-width={sw}
				fill={fillCss}
			/>
		{/if}
	</svg>
	{#if editor.selectedId === el.id}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-blue-500"
			onpointerdown={(e) => editor.startResize(e, shape)}
		></span>
	{/if}
</div>
