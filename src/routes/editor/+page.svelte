<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import SignaturePad from '$lib/components/SignaturePad.svelte';
	import { EditorState } from './editor.svelte';
	import Toolbar from './Toolbar.svelte';
	import Canvas from './Canvas.svelte';
	import PageManager from './PageManager.svelte';
	import ZoomControls from './ZoomControls.svelte';
	import FieldPropertiesModal from './FieldPropertiesModal.svelte';
	import DocumentPropertiesModal from './DocumentPropertiesModal.svelte';
	import OutlineEditor from './OutlineEditor.svelte';
	import WatermarkModal from './WatermarkModal.svelte';
	import UpsellModal from './UpsellModal.svelte';

	const editor = new EditorState();
	// Free pdf.js worker memory (cached source documents) when leaving the editor.
	onDestroy(() => editor.dispose());

	let showSignaturePad = $state(false);
	const signedIn = $derived(Boolean(page.data['user']));

	let started = $state(false);
	let emptyUploadInput = $state<HTMLInputElement | null>(null);
	let promptedUpload = false;
	const showEmptyState = $derived(!editor.sourceBytes && !started && editor.elements.length === 0);

	// Deep-link from the home CTAs via `?operation=`:
	//   new    → jump straight into a blank canvas (skip the empty state)
	//   upload → open the file picker straight away so the user can choose a PDF
	$effect(() => {
		const op = page.url.searchParams.get('operation');
		if (op === 'new') started = true;
		if (op === 'upload' && !promptedUpload && emptyUploadInput) {
			promptedUpload = true;
			emptyUploadInput.click();
		}
	});

	function startBlank() {
		started = true;
	}
	async function onEmptyUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.loadPdf(file);
		input.value = '';
		started = true;
	}

	function onSignatureDrawn(png: Uint8Array, aspect: number) {
		editor.pendingSignature = { image: png, format: 'png', aspect };
		editor.setTool({ type: 'draw', kind: 'signature' });
		showSignaturePad = false;
	}

	// Undo/redo shortcuts: Cmd/Ctrl+Z, and Cmd/Ctrl+Shift+Z or Ctrl+Y to redo.
	// Skip when typing in a real form control so the browser's native text undo
	// still works there; our contenteditable text elements are document state, so
	// those fall through to document-level undo.
	function onKeydown(event: KeyboardEvent) {
		if (!(event.metaKey || event.ctrlKey)) return;
		const tag = (event.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		const key = event.key.toLowerCase();
		if (key === 'z' && !event.shiftKey) {
			event.preventDefault();
			editor.undo();
		} else if ((key === 'z' && event.shiftKey) || key === 'y') {
			event.preventDefault();
			editor.redo();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex min-h-0 flex-1 flex-col bg-slate-100">
	<Toolbar {editor} onDrawSignature={() => (showSignaturePad = true)} />

	{#if editor.errorMessage}
		<div class="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
			{editor.errorMessage}
		</div>
	{/if}

	<div class="relative flex min-h-0 flex-1">
		{#if !showEmptyState}
			{#if editor.showPages}
				<PageManager {editor} />
			{:else}
				<!-- Collapsed Pages panel: a thin tab to bring it back. -->
				<button
					type="button"
					class="flex shrink-0 items-center border-r border-slate-200 bg-white px-1.5 text-sm text-slate-500 hover:bg-slate-50"
					title="Show pages panel"
					aria-label="Show pages panel"
					onclick={() => (editor.showPages = true)}
				>
					»
				</button>
			{/if}
		{/if}
		{#if showEmptyState}
			<div class="flex flex-1 items-center justify-center">
				<div
					class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-12 py-16"
				>
					<p class="text-lg font-medium text-slate-700">Upload a PDF or start blank</p>
					<div class="flex gap-3">
						<label
							class="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
						>
							Upload PDF
							<input
								bind:this={emptyUploadInput}
								type="file"
								accept="application/pdf,.pdf"
								class="hidden"
								onchange={onEmptyUpload}
							/>
						</label>
						<button
							onclick={startBlank}
							class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
						>
							Start blank
						</button>
					</div>
				</div>
			</div>
		{:else}
			<!-- Canvas region: its own positioning context so the floating zoom bar
			     anchors to the canvas area, not the Pages sidebar (#1). -->
			<div class="relative flex min-h-0 min-w-0 flex-1">
				<Canvas {editor} />
				<ZoomControls {editor} />
				<!-- Warn about links that would be silently dropped at export (#3).
				     Sits above the floating Export button. -->
				{#if editor.invalidLinks.length > 0}
					<div
						class="absolute right-6 bottom-20 z-20 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-lg ring-1 ring-amber-300"
					>
						⚠ {editor.invalidLinks.length}
						{editor.invalidLinks.length === 1 ? 'link has' : 'links have'} no target and won’t be exported.
						Set a URL or page in each link’s toolbar.
					</div>
				{/if}
				<!-- The single, primary Export action: a floating button over the canvas,
				     close to where editing happens and always visible regardless of scroll.
				     Anchored past the canvas's reserved scrollbar gutter so it sits at the
				     viewport corner, clear of the page's content. Lift is motion-safe. -->
				<button
					onclick={() => editor.export()}
					disabled={editor.exporting}
					class="absolute right-6 bottom-6 z-20 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 disabled:opacity-50 motion-safe:hover:-translate-y-0.5"
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
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
					{editor.exporting ? 'Exporting…' : 'Export PDF'}
				</button>
			</div>
		{/if}
	</div>

	{#if showSignaturePad}
		<SignaturePad onuse={onSignatureDrawn} oncancel={() => (showSignaturePad = false)} />
	{/if}

	<FieldPropertiesModal {editor} />
	<DocumentPropertiesModal {editor} />
	<OutlineEditor {editor} />
	<WatermarkModal {editor} />
	<UpsellModal {editor} {signedIn} />
</div>
