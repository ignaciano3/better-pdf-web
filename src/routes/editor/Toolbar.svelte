<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { NAMED_PAGE_SIZES } from './constants';
	import ContentSection from './toolbar/ContentSection.svelte';
	import FieldsSection from './toolbar/FieldsSection.svelte';
	import ShapesSection from './toolbar/ShapesSection.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let {
		editor,
		onDrawSignature,
		ready
	}: { editor: EditorState; onDrawSignature: () => void; ready: boolean } = $props();

	let docMenuOpen = $state(false);
	let confirmNewBlank = $state(false);

	// "New blank" discards the document and can't be undone. Confirm only when
	// there's unsaved work to lose; otherwise clear straight away.
	function newBlank() {
		if (editor.hasUnsavedWork) confirmNewBlank = true;
		else editor.clearSource();
	}

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

	const menuItem = 'block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100';

	// Icon button shared by undo/redo: muted at rest, greyed and inert when disabled.
	const iconBtn =
		'flex h-8 w-8 items-center justify-center rounded text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent';
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<!-- On narrow screens the header wraps so File + Document/Export share the top row
     and the insert-tool sections stack below it, never overlapping (#mobile). On
     `sm`+ it collapses back to one row: File | sections | Document/Export. -->
<header
	class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2"
>
	<!-- File + history cluster. Upload + New blank, then undo/redo. History sits
	     inline with Upload on phones and on lg+, but tucks underneath it at
	     in-between widths where the toolbar is tight — using the space beside the
	     stacked tool sections instead of widening the controls row. -->
	<div
		class="order-1 flex shrink-0 items-center gap-2 sm:flex-col sm:items-start sm:gap-1 lg:flex-row lg:items-center lg:gap-2"
	>
		<!-- Upload + New blank. New blank stacks under Upload only on phones. -->
		<div class="flex flex-col items-start gap-1 2xl:flex-row 2xl:items-center">
			<label
				class="flex cursor-pointer items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
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
					onclick={newBlank}
					class="shrink-0 rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
				>
					New blank
				</button>
			{/if}
		</div>

		{#if ready}
			<!-- Undo / redo. Disabled (not hidden) when there's nothing to step
			     through, so the controls stay put. Keyboard: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z.
			     The divider only shows when undo/redo sits inline with Upload (lg+). -->
			<div class="flex shrink-0 items-center gap-0.5">
				<div class="mr-1 hidden h-5 w-px bg-slate-200 lg:block"></div>
				<button
					onclick={() => editor.undo()}
					disabled={!editor.canUndo}
					class={iconBtn}
					title="Undo (Ctrl+Z)"
					aria-label="Undo"
					aria-keyshortcuts="Control+Z"
				>
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
						<path d="M9 14 4 9l5-5" />
						<path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
					</svg>
				</button>
				<button
					onclick={() => editor.redo()}
					disabled={!editor.canRedo}
					class={iconBtn}
					title="Redo (Ctrl+Shift+Z)"
					aria-label="Redo"
					aria-keyshortcuts="Control+Shift+Z Control+Y"
				>
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
						<path d="m15 14 5-5-5-5" />
						<path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
					</svg>
				</button>
			</div>
		{/if}
	</div>

	{#if ready}
		<!-- Center: Insert tools. Phones: a single horizontally-scrollable strip.
	     sm–md (not enough room for one row): the original flex-wrap.
	     lg+: one flex row where each section grows from its content size, so the
	     wider sections (Fields) get proportionally more room and the centre fills
	     instead of breaking into equal, half-empty columns (#3). -->
		<div
			class="order-3 flex w-full min-w-0 flex-nowrap items-center gap-x-4 gap-y-2 overflow-x-auto sm:order-2 sm:w-auto sm:flex-1 sm:flex-wrap sm:overflow-x-visible lg:flex-nowrap lg:items-start"
		>
			<ContentSection {editor} {onDrawSignature} />
			<FieldsSection {editor} />
			<!-- Shapes kept last (#2). -->
			<ShapesSection {editor} />
		</div>

		<!-- Right: document menu. On mobile it shares the top row with File (ml-auto
	     pushes it to the edge); on sm+ it sits at the far right as before. Export
	     is the floating action button over the canvas (see +page.svelte), not here:
	     one primary action, close to the work, clear of the header's Sign-up button. -->
		<div class="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0">
			<div class="relative" data-menu="doc">
				<button
					class="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
					aria-haspopup="menu"
					aria-expanded={docMenuOpen}
					onclick={() => (docMenuOpen = !docMenuOpen)}
				>
					Document
					<svg
						class="h-3.5 w-3.5 text-slate-400"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="m6 9 6 6 6-6" />
					</svg>
				</button>
				{#if docMenuOpen}
					<div
						class="absolute top-full right-0 z-30 mt-1 max-h-96 w-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
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
						<button
							class={menuItem}
							role="menuitem"
							onclick={() => {
								editor.watermarkModalOpen = true;
								docMenuOpen = false;
							}}
						>
							Watermark…
						</button>
						<button
							class={menuItem}
							role="menuitem"
							onclick={() => {
								editor.headerFooterModalOpen = true;
								docMenuOpen = false;
							}}
						>
							Header &amp; footer…
						</button>
						<button
							class={menuItem}
							role="menuitem"
							onclick={() => {
								editor.attachmentsModalOpen = true;
								docMenuOpen = false;
							}}
						>
							Attachments…
						</button>
						{#if editor.pageOps.length > 0}
							<div class="my-1 border-t border-slate-100"></div>
							<p class="px-3 py-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
								Page size
							</p>
							{#each NAMED_PAGE_SIZES as s (s.label)}
								<button
									class={menuItem}
									role="menuitem"
									onclick={() => applyPageSize(s.size, false)}
								>
									{s.label} portrait
								</button>
								<button
									class={menuItem}
									role="menuitem"
									onclick={() => applyPageSize(s.size, true)}
								>
									{s.label} landscape
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</header>

<ConfirmDialog
	bind:open={confirmNewBlank}
	tone="danger"
	title="Start a blank document?"
	message="Your current changes will be discarded and can't be recovered. Export first if you want to keep them."
	confirmLabel="Discard & start blank"
	cancelLabel="Keep editing"
	onconfirm={() => editor.clearSource()}
/>
