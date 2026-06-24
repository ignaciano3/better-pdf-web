<script lang="ts">
	import type { EditorState } from './editor.svelte';

	let { editor }: { editor: EditorState } = $props();

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

{#if editor.pageOps.length > 0}
	<aside class="flex w-44 flex-col gap-3 overflow-y-auto border-r border-gray-200 bg-white p-3">
		<div class="flex items-center justify-between">
			<h2 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Pages</h2>
			<button
				type="button"
				class="rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
				title="Insert blank page at end"
				onclick={() => editor.insertBlankPage(editor.pageOps.length - 1)}
			>
				+ Blank
			</button>
		</div>

		{#each editor.pages as page, i (i)}
			{@const render = editor.pageRender(i)}
			{@const rot = editor.pageRotation(i)}
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
					class="flex items-center justify-center overflow-hidden bg-gray-100 shadow-sm"
					style={thumbStyle(page.width, page.height)}
				>
					{#if render}
						<img
							src={render.dataUrl}
							alt={`Page ${i + 1}`}
							class="max-w-none select-none"
							style="width: {rot % 180 === 0
								? THUMB_W
								: (THUMB_W / page.width) * page.height}px; transform: rotate({rot}deg);"
							draggable="false"
						/>
					{:else}
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
						onclick={() => editor.insertBlankPage(i)}>＋</button
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
