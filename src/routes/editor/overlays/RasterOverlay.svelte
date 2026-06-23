<script lang="ts">
	import type { EditElement, ImageElement, SignatureElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState } = $props();
	const raster = $derived(el as SignatureElement | ImageElement);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute cursor-move {editor.selectedId === el.id ? 'ring-2 ring-blue-400' : ''}"
	style="left: {raster.x * SCALE}px; top: {raster.y * SCALE}px; width: {raster.width *
		SCALE}px; height: {raster.height * SCALE}px;"
	onpointerdown={(e) => editor.startDrag(e, raster)}
>
	<img
		src={editor.rasterUrl(raster)}
		alt={raster.type === 'signature' ? 'Signature' : 'Image'}
		class="pointer-events-none h-full w-full select-none"
		draggable="false"
	/>
	{#if editor.selectedId === el.id}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-blue-500"
			onpointerdown={(e) => editor.startResize(e, raster)}
		></span>
	{/if}
</div>
