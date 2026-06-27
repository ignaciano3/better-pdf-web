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

	// Page-control buttons (move/rotate/insert/delete). Icon-only, so each needs a
	// descriptive aria-label; a visible focus ring keeps them keyboard-navigable.
	const opBtn =
		'inline-flex items-center justify-center rounded p-1 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none disabled:opacity-30';

	// Thumbnail dimensions, scaled to fit a small fixed width.
	const THUMB_W = 96;
	function thumbStyle(width: number, height: number): string {
		const h = Math.round((THUMB_W / width) * height);
		return `width: ${THUMB_W}px; height: ${h}px;`;
	}
</script>

<!-- Stroked icons matching the toolbar's icon family (Upload / undo / Export),
     defined once and reused across every page row instead of emoji glyphs. -->
{#snippet iconChevronLeft()}
	<svg
		class="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></svg
	>
{/snippet}
{#snippet iconUp()}
	<svg
		class="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg
	>
{/snippet}
{#snippet iconDown()}
	<svg
		class="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg
	>
{/snippet}
{#snippet iconRotate()}
	<svg
		class="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.85.99 6.6 2.6L21 8" /><path d="M21 3v5h-5" /></svg
	>
{/snippet}
{#snippet iconPlus()}
	<svg
		class="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg
	>
{/snippet}
{#snippet iconTrash()}
	<svg
		class="h-3.5 w-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path
			d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
		/></svg
	>
{/snippet}

{#if editor.pages.length > 0}
	<aside
		class="absolute inset-y-0 left-0 z-30 flex w-44 flex-col gap-3 overflow-y-auto border-r border-slate-200 bg-white p-3 shadow-xl sm:relative sm:z-auto sm:shadow-none"
	>
		<div class="flex items-center justify-between">
			<h2 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">Pages</h2>
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
					title="Insert blank page at end"
					aria-label="Insert blank page at end"
					onclick={() => insertBlank(editor.pages.length - 1)}
				>
					+ Blank
				</button>
				<button
					type="button"
					class="inline-flex items-center justify-center rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
					title="Hide pages panel"
					aria-label="Hide pages panel"
					onclick={() => (editor.showPages = false)}
				>
					{@render iconChevronLeft()}
				</button>
			</div>
		</div>

		<!-- Size for newly inserted blank pages (#5). -->
		<select
			class="w-full rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
			title="Size for new blank pages"
			aria-label="Size for new blank pages"
			bind:value={newPageSizeIndex}
		>
			{#each PAGE_SIZES as ps, i (i)}
				<option value={i}>{ps.label}</option>
			{/each}
		</select>

		{#each editor.pages as page, i (i)}
			{@const render = editor.pageRender(i)}
			{@const rot = editor.pageRotation(i)}
			{@const box = editor.pageContentBox(i)}
			{@const els = editor.elementsForPage(i)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="group flex flex-col items-center gap-1 rounded border p-2 transition-colors {dragIndex ===
				i
					? 'border-blue-400 bg-blue-50'
					: 'border-slate-200'}"
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
							<!-- Fill the content box (override or source size), matching the
							     main canvas and the export. -->
							<img
								src={render.dataUrl}
								alt={`Page ${i + 1}`}
								class="absolute top-1/2 left-1/2 max-w-none select-none"
								style="width: {box.width * SCALE}px; height: {box.height *
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
						<span class="text-[10px] text-slate-500">blank</span>
					{/if}
				</div>

				<div class="text-[11px] text-slate-500">Page {i + 1}</div>

				<div class="flex flex-wrap items-center justify-center gap-0.5">
					<button
						type="button"
						class="{opBtn} text-slate-600"
						title="Move up"
						aria-label="Move page {i + 1} up"
						disabled={i === 0}
						onclick={() => editor.movePageUp(i)}>{@render iconUp()}</button
					>
					<button
						type="button"
						class="{opBtn} text-slate-600"
						title="Move down"
						aria-label="Move page {i + 1} down"
						disabled={i === editor.pages.length - 1}
						onclick={() => editor.movePageDown(i)}>{@render iconDown()}</button
					>
					<button
						type="button"
						class="{opBtn} text-slate-600"
						title="Rotate 90°"
						aria-label="Rotate page {i + 1} 90 degrees"
						onclick={() => editor.rotatePage(i)}>{@render iconRotate()}</button
					>
					<button
						type="button"
						class="{opBtn} text-slate-600"
						title="Insert blank after"
						aria-label="Insert blank page after page {i + 1}"
						onclick={() => insertBlank(i)}>{@render iconPlus()}</button
					>
					<button
						type="button"
						class="{opBtn} text-red-500 hover:bg-red-50"
						title="Delete page"
						aria-label="Delete page {i + 1}"
						disabled={editor.pages.length <= 1}
						onclick={() => editor.deletePage(i)}>{@render iconTrash()}</button
					>
				</div>
			</div>
		{/each}
	</aside>
{/if}
