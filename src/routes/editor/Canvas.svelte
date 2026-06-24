<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { SCALE } from './constants';
	import { overlayFor } from './overlays';

	let { editor }: { editor: EditorState } = $props();

	function onPageClick(event: MouseEvent, pageIndex: number) {
		// Only add when clicking the bare page, not an existing element overlay.
		if (event.target !== event.currentTarget) return;
		// A shape draw was started on pointerdown and committed on pointerup; the
		// trailing click must not also drop a text element.
		if (editor.shapeTool) return;
		editor.placeAtClient(
			event.clientX,
			event.clientY,
			event.currentTarget as HTMLElement,
			pageIndex
		);
	}

	function onPagePointerDown(event: PointerEvent, pageIndex: number) {
		// Begin a shape drag only when pressing the bare page with a tool active.
		if (event.target !== event.currentTarget) return;
		editor.beginShapeDraw(event, event.currentTarget as HTMLElement, pageIndex);
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
				onpointerdown={(e) => onPagePointerDown(e, pageIndex)}
			>
				{#if editor.pageRender(pageIndex)}
					{@const render = editor.pageRender(pageIndex)}
					{@const rot = editor.pageRotation(pageIndex)}
					<img
						src={render?.dataUrl}
						alt={`Page ${pageIndex + 1}`}
						class="pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
						style="width: {(render?.width ?? page.width) * SCALE}px; height: {(render?.height ??
							page.height) * SCALE}px; transform: translate(-50%, -50%) rotate({rot}deg);"
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
