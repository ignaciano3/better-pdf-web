<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { SCALE } from './constants';
	import { overlayFor } from './overlays';
	import WatermarkOverlay from './overlays/WatermarkOverlay.svelte';
	import FloatingToolbar from './FloatingToolbar.svelte';

	let { editor }: { editor: EditorState } = $props();

	// Default the canvas to fit-to-width (#6). Re-fits whenever the first page's
	// size changes (a new document loaded) but never fights a manual zoom for the
	// same document.
	let fittedFor = $state<string | null>(null);
	$effect(() => {
		const width = editor.canvasWidth;
		const first = editor.pages[0];
		if (!first || width <= 0) return;
		const key = `${first.width}x${first.height}`;
		if (fittedFor === key) return;
		fittedFor = key;
		editor.fitToWidth(width);
	});

	function onPageClick(event: MouseEvent, pageIndex: number) {
		// Only act on the bare page, not an existing element overlay.
		if (event.target !== event.currentTarget) return;
		// Swallow the click that immediately follows a drag-draw so it doesn't
		// deselect the shape/path/link the user just created.
		if (editor.suppressNextClick) {
			editor.suppressNextClick = false;
			return;
		}
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
		// A fresh gesture: drop any leftover click-suppression from a drag-draw that
		// never produced a trailing click.
		editor.suppressNextClick = false;
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

<div class="relative flex-1 overflow-auto p-8" bind:clientWidth={editor.canvasWidth}>
	<!-- While placing an image/signature, the destination isn't obvious until the
	     click lands, so float a hint and switch the page cursor to a crosshair. -->
	{#if editor.pendingImage || editor.pendingSignature}
		<div
			class="pointer-events-none sticky top-0 z-30 mx-auto w-fit rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg"
		>
			Click on the page to place your {editor.pendingImage ? 'image' : 'signature'}
		</div>
	{:else if editor.tool.type === 'draw' && editor.tool.kind === 'polygon'}
		<!-- Polygon is multi-click and non-obvious; spell out the gesture (#4). -->
		<div
			class="pointer-events-none sticky top-0 z-30 mx-auto w-fit rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg"
		>
			Click to add points • double-click or Enter to close • Esc to cancel
		</div>
	{/if}
	<!-- CSS `zoom` (not `transform: scale`) so the scaled pages keep a real
	     layout box: overflow scrollbars and mx-auto centering both stay correct,
	     and pointer math (cssScale = SCALE * zoom) is unaffected. -->
	<div class="mx-auto flex w-fit flex-col gap-6" style="zoom: {editor.zoom};">
		{#each editor.pages as page, pageIndex (pageIndex)}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="relative bg-white shadow-lg {editor.tool.type !== 'select'
					? 'cursor-crosshair'
					: ''}"
				style="width: {page.width * SCALE}px; height: {page.height * SCALE}px;"
				onclick={(e) => onPageClick(e, pageIndex)}
				ondblclick={onPageDblClick}
				onpointerdown={(e) => onPagePointerDown(e, pageIndex)}
			>
				{#if editor.pageRender(pageIndex)}
					{@const render = editor.pageRender(pageIndex)}
					{@const rot = editor.pageRotation(pageIndex)}
					{@const box = editor.pageContentBox(pageIndex)}
					<!-- Scale the source image to the (un-rotated) content box, not its
					     intrinsic size, so a page-size override matches the export, which
					     stretches the embedded page to fill the same box. -->
					<img
						src={render?.dataUrl}
						alt={`Page ${pageIndex + 1}`}
						class="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
						style="width: {box.width * SCALE}px; height: {box.height *
							SCALE}px; transform: translate(-50%, -50%) rotate({rot}deg);"
						draggable="false"
					/>
				{/if}
				{#each editor.elementsForPage(pageIndex) as el (el.id)}
					{@const Overlay = overlayFor(el.type)}
					<Overlay {el} {editor} />
				{/each}
				{#if editor.watermark}
					<WatermarkOverlay
						watermark={editor.watermark}
						pageWidth={page.width * SCALE}
						pageHeight={page.height * SCALE}
					/>
				{/if}
				<!-- The selected element's options panel lives inside its page so it
				     tracks the element through zoom and scroll, instead of drifting
				     (#2). Only the page holding the selection renders it. -->
				{#if editor.selected && (editor.selected.page ?? 0) === pageIndex}
					<FloatingToolbar {editor} pageHeight={page.height * SCALE} />
				{/if}
			</div>
		{/each}

		<!-- Click-to-add-page zone below the last page (#15). -->
		<button
			type="button"
			class="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white/50 py-6 text-sm font-medium text-gray-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600"
			style="width: {(editor.pages[0]?.width ?? 595) * SCALE}px;"
			onclick={() => editor.insertBlankPage(editor.pages.length - 1)}
		>
			+ Add page
		</button>
	</div>
</div>
