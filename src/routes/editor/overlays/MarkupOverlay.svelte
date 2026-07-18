<script lang="ts">
	import type { MarkupElement } from '$lib/pdf/types';
	import type { OverlayProps } from './types';
	import { SCALE } from '../constants';

	let { el, editor }: OverlayProps = $props();
	const m = $derived(el as MarkupElement);

	const w = $derived(Math.max(m.width, 0) * SCALE);
	const h = $derived(Math.max(m.height, 0) * SCALE);
	const colorCss = $derived(
		`rgb(${Math.round(m.color.r * 255)} ${Math.round(m.color.g * 255)} ${Math.round(m.color.b * 255)})`
	);
	const thickPx = $derived((m.thickness ?? 1.5) * SCALE);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute touch-none cursor-move {editor.selectedId === el.id
		? 'ring-2 ring-blue-400'
		: ''}"
	style="left: {m.x * SCALE}px; top: {m.y * SCALE}px; width: {w}px; height: {h}px;"
	onpointerdown={(e) => editor.startDrag(e, m)}
>
	{#if m.markup === 'highlight'}
		<div
			class="pointer-events-none absolute inset-0"
			style="background: {colorCss}; opacity: {m.opacity ?? 0.4};"
		></div>
	{:else}
		<!-- underline sits at the bottom edge; strikethrough at the vertical centre. -->
		<div
			class="pointer-events-none absolute"
			style="left: 0; width: 100%; height: {Math.max(thickPx, 1)}px; background: {colorCss};
				{m.markup === 'strikethrough'
				? 'top: 50%; transform: translateY(-50%);'
				: 'bottom: 0;'}"
		></div>
	{/if}
	{#if editor.selectedId === el.id}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="absolute -right-1.5 -bottom-1.5 h-3 w-3 touch-none cursor-nwse-resize rounded-sm border border-white bg-blue-500"
			onpointerdown={(e) => editor.startResize(e, m)}
		></span>
	{/if}
</div>
