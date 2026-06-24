<script lang="ts">
	import type { EditorState } from './editor.svelte';

	let { editor }: { editor: EditorState } = $props();
</script>

<!-- Floating zoom bar, anchored bottom-left over the canvas. -->
<div
	class="absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white/95 p-0.5 shadow-lg backdrop-blur"
>
	<button
		class="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
		title="Zoom out"
		aria-label="Zoom out"
		onclick={() => editor.zoomOut()}>−</button
	>
	<button
		class="w-12 rounded px-1 py-1 text-center text-xs text-gray-700 hover:bg-gray-100"
		title="Reset zoom"
		onclick={() => editor.resetZoom()}>{Math.round(editor.zoom * 100)}%</button
	>
	<button
		class="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
		title="Zoom in"
		aria-label="Zoom in"
		onclick={() => editor.zoomIn()}>+</button
	>
	<button
		class="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
		title="Fit to width"
		onclick={() => editor.fitToWidth()}>Fit</button
	>
</div>
