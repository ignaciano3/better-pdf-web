<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { NAMED_PAGE_SIZES } from './constants';
	import ContentSection from './toolbar/ContentSection.svelte';
	import FieldsSection from './toolbar/FieldsSection.svelte';
	import ShapesSection from './toolbar/ShapesSection.svelte';

	let { editor, onDrawSignature }: { editor: EditorState; onDrawSignature: () => void } = $props();

	let docMenuOpen = $state(false);

	// Close the Document dropdown when the user presses anywhere outside it.
	function onWindowPointerDown(event: PointerEvent) {
		const target = event.target as HTMLElement;
		if (docMenuOpen && !target.closest('[data-menu="doc"]')) docMenuOpen = false;
	}

	async function onMergeChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.appendPdf(file);
		input.value = '';
		docMenuOpen = false;
	}

	function applyPageSize(size: [number, number], landscape: boolean) {
		const [w, h] = size;
		const dims: [number, number] = landscape ? [Math.max(w, h), Math.min(w, h)] : [w, h];
		editor.setAllPageSizes(dims);
		docMenuOpen = false;
	}

	async function onPdfChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.loadPdf(file);
		input.value = '';
	}

	const menuItem = 'block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100';
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<!-- On narrow screens the header wraps so File + Document/Export share the top row
     and the insert-tool sections stack below it, never overlapping (#mobile). On
     `sm`+ it collapses back to one row: File | sections | Document/Export. -->
<header
	class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200 bg-white px-3 py-2"
>
	<!-- Left: File (icons). Stacks New blank under Upload on narrow screens. -->
	<div class="order-1 flex shrink-0 flex-col items-start gap-1 sm:flex-row sm:items-center">
		<label
			class="flex cursor-pointer items-center gap-1.5 rounded bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
			title="Upload a PDF"
		>
			<!-- upload icon -->
			<svg
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			{editor.loadingPdf ? 'Loading…' : 'Upload'}
			<input
				type="file"
				accept="application/pdf,.pdf"
				class="hidden"
				disabled={editor.loadingPdf}
				onchange={onPdfChange}
			/>
		</label>
		{#if editor.sourceBytes}
			<button
				onclick={() => editor.clearSource()}
				class="shrink-0 rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
			>
				New blank
			</button>
		{/if}
	</div>

	<!-- Center: Insert tools. Wraps onto more rows when the viewport is too narrow
	     to fit every section on one line (#3), so nothing is pushed off-screen. -->
	<div
		class="order-3 flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 sm:order-2 sm:w-auto sm:flex-1"
	>
		<ContentSection {editor} {onDrawSignature} />
		<FieldsSection {editor} />
		<!-- Shapes kept last (#2). -->
		<ShapesSection {editor} />
	</div>

	<!-- Right: document menu + export. On mobile it shares the top row with File
	     (ml-auto pushes it to the edge); on sm+ it sits at the far right as before. -->
	<div class="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0">
		<div class="relative" data-menu="doc">
			<button
				class="rounded px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
				aria-haspopup="menu"
				aria-expanded={docMenuOpen}
				onclick={() => (docMenuOpen = !docMenuOpen)}
			>
				Document ▾
			</button>
			{#if docMenuOpen}
				<div
					class="absolute top-full right-0 z-30 mt-1 max-h-96 w-52 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
					role="menu"
				>
					<label class="{menuItem} block cursor-pointer">
						Merge / append PDF…
						<input
							type="file"
							accept="application/pdf,.pdf"
							class="hidden"
							disabled={editor.loadingPdf}
							onchange={onMergeChange}
						/>
					</label>
					<button
						class={menuItem}
						role="menuitem"
						onclick={() => {
							editor.docPropsModalOpen = true;
							docMenuOpen = false;
						}}
					>
						Properties…
					</button>
					<button
						class={menuItem}
						role="menuitem"
						onclick={() => {
							editor.outlineEditorOpen = true;
							docMenuOpen = false;
						}}
					>
						Outline / bookmarks…
					</button>
					{#if editor.pageOps.length > 0}
						<div class="my-1 border-t border-gray-100"></div>
						<p class="px-3 py-1 text-xs font-medium tracking-wide text-gray-400 uppercase">
							Page size
						</p>
						{#each NAMED_PAGE_SIZES as s (s.label)}
							<button class={menuItem} role="menuitem" onclick={() => applyPageSize(s.size, false)}>
								{s.label} portrait
							</button>
							<button class={menuItem} role="menuitem" onclick={() => applyPageSize(s.size, true)}>
								{s.label} landscape
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>

		<button
			onclick={() => editor.export()}
			disabled={editor.exporting}
			class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
		>
			{editor.exporting ? 'Exporting…' : 'Export PDF'}
		</button>
	</div>
</header>
