<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { OutlineItem } from '$lib/pdf/types';

	let { editor }: { editor: EditorState } = $props();

	const open = $derived(editor.outlineEditorOpen);
	const pageCount = $derived(Math.max(1, editor.pages.length));

	function pageOptions(): number[] {
		return Array.from({ length: pageCount }, (_, i) => i);
	}

	function updateTitle(item: OutlineItem, value: string) {
		item.title = value;
	}
	function updatePage(item: OutlineItem, value: string) {
		const n = Number.parseInt(value, 10);
		if (Number.isInteger(n)) item.page = n;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) editor.outlineEditorOpen = false;
		}}
	>
		<div class="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white p-5 shadow-xl">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-base font-semibold text-gray-900">Outline / bookmarks</h2>
				<button
					type="button"
					class="rounded bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100"
					onclick={() => editor.addBookmark('New bookmark', 0)}
				>
					+ Bookmark
				</button>
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if editor.outline.length === 0}
					<p class="py-6 text-center text-sm text-gray-400">No bookmarks yet.</p>
				{:else}
					<ul class="flex flex-col gap-2">
						{#each editor.outline as item, i (i)}
							<li class="rounded border border-gray-200 p-2">
								<div class="flex items-center gap-2">
									<input
										type="text"
										class="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
										value={item.title}
										oninput={(e) => updateTitle(item, (e.currentTarget as HTMLInputElement).value)}
									/>
									<select
										class="rounded border border-gray-300 px-1.5 py-1 text-sm"
										value={String(item.page)}
										onchange={(e) => updatePage(item, (e.currentTarget as HTMLSelectElement).value)}
									>
										{#each pageOptions() as p (p)}
											<option value={String(p)}>Page {p + 1}</option>
										{/each}
									</select>
									<button
										type="button"
										class="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
										title="Move up"
										disabled={i === 0}
										onclick={() => editor.moveBookmark(i, -1)}>↑</button
									>
									<button
										type="button"
										class="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
										title="Move down"
										disabled={i === editor.outline.length - 1}
										onclick={() => editor.moveBookmark(i, 1)}>↓</button
									>
									<button
										type="button"
										class="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
										title="Nest under previous"
										disabled={i === 0}
										onclick={() => editor.nestBookmark(i)}>→</button
									>
									<button
										type="button"
										class="rounded px-1.5 py-1 text-xs text-red-500 hover:bg-red-50"
										title="Remove"
										onclick={() => editor.removeBookmark(i)}>🗑</button
									>
								</div>
								{#if item.children && item.children.length > 0}
									<ul class="mt-2 ml-5 flex flex-col gap-1 border-l border-gray-200 pl-2">
										{#each item.children as child, ci (ci)}
											<li class="flex items-center gap-2">
												<input
													type="text"
													class="flex-1 rounded border border-gray-300 px-2 py-0.5 text-sm"
													value={child.title}
													oninput={(e) =>
														updateTitle(child, (e.currentTarget as HTMLInputElement).value)}
												/>
												<select
													class="rounded border border-gray-300 px-1.5 py-0.5 text-sm"
													value={String(child.page)}
													onchange={(e) =>
														updatePage(child, (e.currentTarget as HTMLSelectElement).value)}
												>
													{#each pageOptions() as p (p)}
														<option value={String(p)}>Page {p + 1}</option>
													{/each}
												</select>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="mt-4 flex justify-end">
				<button
					type="button"
					class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					onclick={() => (editor.outlineEditorOpen = false)}
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}
