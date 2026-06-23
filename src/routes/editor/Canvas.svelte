<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { SCALE } from './constants';
	import { overlayFor } from './overlays';

	let { editor }: { editor: EditorState } = $props();

	function onPageClick(event: MouseEvent, pageIndex: number) {
		// Only add when clicking the bare page, not an existing element overlay.
		if (event.target !== event.currentTarget) return;
		editor.placeAtClient(
			event.clientX,
			event.clientY,
			event.currentTarget as HTMLElement,
			pageIndex
		);
	}
</script>

<div class="flex-1 overflow-auto p-8">
	<div class="mx-auto flex w-fit flex-col gap-6">
		{#each editor.pages as page, pageIndex (pageIndex)}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="relative bg-white shadow-lg"
				style="width: {page.width * SCALE}px; height: {page.height * SCALE}px;"
				onclick={(e) => onPageClick(e, pageIndex)}
			>
				{#if editor.rendered[pageIndex]}
					<img
						src={editor.rendered[pageIndex].dataUrl}
						alt={`Page ${pageIndex + 1}`}
						class="pointer-events-none absolute inset-0 h-full w-full select-none"
						draggable="false"
					/>
				{/if}
				{#each editor.elementsForPage(pageIndex) as el (el.id)}
					{@const Overlay = overlayFor(el.type)}
					<Overlay {el} {editor} />
				{/each}
			</div>
		{/each}
	</div>
</div>
