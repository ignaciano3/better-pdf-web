<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { SCALE, PAGE_SIZES } from './constants';
	import { overlayFor } from './overlays';

	let { editor }: { editor: EditorState } = $props();

	// Size used for newly inserted blank pages (#5). Index into PAGE_SIZES;
	// 0 = "Match document" (clone the first page).
	let newPageSizeIndex = $state(0);
	function insertBlank(afterIndex: number) {
		editor.insertBlankPage(afterIndex, PAGE_SIZES[newPageSizeIndex]?.size ?? undefined);
	}

	// Drag-to-reorder state. `dragIndex` is the page being dragged.
	let dragIndex = $state<number | null>(null);

	function onDragStart(index: number) {
		dragIndex = index;
	}

	function onDrop(targetIndex: number) {
		if (dragIndex !== null && dragIndex !== targetIndex) {
			editor.movePage(dragIndex, targetIndex);
		}
		dragIndex = null;
	}

	// Thumbnail dimensions, scaled to fit a small fixed width.
	const THUMB_W = 96;
	function thumbStyle(width: number, height: number): string {
		const h = Math.round((THUMB_W / width) * height);
		return `width: ${THUMB_W}px; height: ${h}px;`;
	}
</script>

{#if editor.pages.length > 0}
	<aside class="flex w-44 flex-col gap-3 overflow-y-auto border-r border-gray-200 bg-white p-3">
		<div class="flex items-center justify-between">
			<h2 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Pages</h2>
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
					title="Insert blank page at end"
					onclick={() => insertBlank(editor.pages.length - 1)}
				>
					+ Blank
				</button>
				<button
					type="button"
					class="rounded px-1.5 py-0.5 text-sm text-gray-500 hover:bg-gray-100"
					title="Hide pages panel"
					aria-label="Hide pages panel"
					onclick={() => (editor.showPages = false)}
				>
					«
				</button>
			</div>
		</div>

		<!-- Size for newly inserted blank pages (#5). -->
		<select
			class="w-full rounded border border-gray-200 px-1 py-0.5 text-xs text-gray-600"
			title="Size for new blank pages"
			bind:value={newPageSizeIndex}
		>
			{#each PAGE_SIZES as ps, i (i)}
				<option value={i}>{ps.label}</option>
			{/each}
		</select>

		{#each editor.pages as page, i (i)}
			{@const render = editor.pageRender(i)}
			{@const rot = editor.pageRotation(i)}
			{@const els = editor.elementsForPage(i)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="group flex flex-col items-center gap-1 rounded border p-2 transition-colors {dragIndex ===
				i
					? 'border-blue-400 bg-blue-50'
					: 'border-gray-200'}"
				draggable="true"
				ondragstart={() => onDragStart(i)}
				ondragover={(e) => e.preventDefault()}
				ondrop={() => onDrop(i)}
			>
				<div
					class="relative flex items-center justify-center overflow-hidden bg-white shadow-sm"
					style={thumbStyle(page.width, page.height)}
				>
					<!-- Scaled, inert mirror of the page: the source raster plus every
					     element overlay, so thumbnails reflect edits (text, shapes…) and
					     never read "blank" once content is added (#7). -->
					<div
						class="pointer-events-none absolute top-0 left-0 origin-top-left"
						inert
						style="width: {page.width * SCALE}px; height: {page.height *
							SCALE}px; transform: scale({THUMB_W / (page.width * SCALE)});"
					>
						{#if render}
							<img
								src={render.dataUrl}
								alt={`Page ${i + 1}`}
								class="absolute top-1/2 left-1/2 max-w-none select-none"
								style="width: {render.width * SCALE}px; height: {render.height *
									SCALE}px; transform: translate(-50%, -50%) rotate({rot}deg);"
								draggable="false"
							/>
						{/if}
						{#each els as el (el.id)}
							{@const Overlay = overlayFor(el.type)}
							<Overlay {el} {editor} preview />
						{/each}
					</div>
					{#if !render && els.length === 0}
						<span class="text-[10px] text-gray-400">blank</span>
					{/if}
				</div>

				<div class="text-[11px] text-gray-500">Page {i + 1}</div>

				<div class="flex flex-wrap items-center justify-center gap-0.5">
					<button
						type="button"
						class="rounded px-1 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100 disabled:opacity-30"
						title="Move up"
						disabled={i === 0}
						onclick={() => editor.movePageUp(i)}>↑</button
					>
					<button
						type="button"
						class="rounded px-1 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100 disabled:opacity-30"
						title="Move down"
						disabled={i === editor.pages.length - 1}
						onclick={() => editor.movePageDown(i)}>↓</button
					>
					<button
						type="button"
						class="rounded px-1 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
						title="Rotate 90°"
						onclick={() => editor.rotatePage(i)}>⟳</button
					>
					<button
						type="button"
						class="rounded px-1 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100"
						title="Insert blank after"
						onclick={() => insertBlank(i)}>＋</button
					>
					<button
						type="button"
						class="rounded px-1 py-0.5 text-[11px] text-red-500 hover:bg-red-50 disabled:opacity-30"
						title="Delete page"
						disabled={editor.pages.length <= 1}
						onclick={() => editor.deletePage(i)}>🗑</button
					>
				</div>
			</div>
		{/each}
	</aside>
{/if}
