<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { SCALE } from './constants';
	import { overlayFor } from './overlays';

	let { editor }: { editor: EditorState } = $props();

	function onPageClick(event: MouseEvent, pageIndex: number) {
		// Only act on the bare page, not an existing element overlay.
		if (event.target !== event.currentTarget) return;
		if (editor.tool.type === 'select') {
			editor.select(null);
			return;
		}
		// Shape kinds were drawn on pointerdown→up; placeAtClient ignores them.
		editor.placeAtClient(
			event.clientX,
			event.clientY,
			event.currentTarget as HTMLElement,
			pageIndex
		);
	}

	function onPagePointerDown(event: PointerEvent, pageIndex: number) {
		if (event.target !== event.currentTarget) return;
		const el = event.currentTarget as HTMLElement;
		// Drag-drawn kinds claim the gesture on pointerdown; the first that matches
		// the active tool handles it (each no-ops when its tool isn't active).
		if (editor.beginShapeDraw(event, el, pageIndex)) return;
		if (editor.beginFreehandDraw(event, el, pageIndex)) return;
		editor.beginLinkDraw(event, el, pageIndex);
	}

	function onPageDblClick(event: MouseEvent) {
		// Double-click closes an in-progress polygon.
		if (editor.polygonDraftId) {
			event.preventDefault();
			editor.closePolygon();
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (!editor.polygonDraftId) return;
		if (event.key === 'Enter') {
			event.preventDefault();
			editor.closePolygon();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			editor.cancelPolygon();
		}
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="flex-1 overflow-auto p-8" bind:clientWidth={editor.canvasWidth}>
	<div
		class="mx-auto flex w-fit flex-col gap-6"
		style="transform: scale({editor.zoom}); transform-origin: top center;"
	>
		{#each editor.pages as page, pageIndex (pageIndex)}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="relative bg-white shadow-lg"
				style="width: {page.width * SCALE}px; height: {page.height * SCALE}px;"
				onclick={(e) => onPageClick(e, pageIndex)}
				ondblclick={onPageDblClick}
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
