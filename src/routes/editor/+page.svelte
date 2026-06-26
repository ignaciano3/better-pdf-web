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
</script>

<div class="flex min-h-0 flex-1 flex-col bg-gray-100">
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
					class="flex shrink-0 items-center border-r border-gray-200 bg-white px-1.5 text-sm text-gray-500 hover:bg-gray-50"
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
					class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-white px-12 py-16"
				>
					<p class="text-lg font-medium text-gray-700">Upload a PDF or start blank</p>
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
							class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
						>
							Start blank
						</button>
					</div>
				</div>
			</div>
		{:else}
			<!-- Canvas region: its own positioning context so the floating zoom bar and
			     export button anchor to the gray canvas area, not the Pages sidebar (#1). -->
			<div class="relative flex min-h-0 min-w-0 flex-1">
				<Canvas {editor} />
				<ZoomControls {editor} />
				<!-- Warn about links that would be silently dropped at export (#3). -->
				{#if editor.invalidLinks.length > 0}
					<div
						class="absolute right-6 bottom-20 z-20 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-lg ring-1 ring-amber-300"
					>
						⚠ {editor.invalidLinks.length}
						{editor.invalidLinks.length === 1 ? 'link has' : 'links have'} no target and won’t be exported.
						Set a URL or page in each link’s toolbar.
					</div>
				{/if}
				<!-- Floating export, pinned bottom-right over the canvas (#13). -->
				<button
					onclick={() => editor.export()}
					disabled={editor.exporting}
					class="absolute right-6 bottom-6 z-20 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-700 disabled:opacity-50"
				>
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
