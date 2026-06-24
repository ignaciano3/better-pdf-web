<script lang="ts">
	import { page } from '$app/state';
	import SignaturePad from '$lib/components/SignaturePad.svelte';
	import { EditorState } from './editor.svelte';
	import Toolbar from './Toolbar.svelte';
	import Canvas from './Canvas.svelte';
	import PageManager from './PageManager.svelte';
	import FloatingToolbar from './FloatingToolbar.svelte';
	import ZoomControls from './ZoomControls.svelte';
	import FieldPropertiesModal from './FieldPropertiesModal.svelte';
	import DocumentPropertiesModal from './DocumentPropertiesModal.svelte';
	import OutlineEditor from './OutlineEditor.svelte';
	import UpsellModal from './UpsellModal.svelte';

	const editor = new EditorState();
	let showSignaturePad = $state(false);
	const signedIn = $derived(Boolean(page.data['user']));

	let started = $state(false);
	const showEmptyState = $derived(!editor.sourceBytes && !started && editor.elements.length === 0);

	// Deep-link from the home CTAs via `?operation=`:
	//   new    → jump straight into a blank canvas (skip the empty state)
	//   upload → show the upload-or-blank empty state
	$effect(() => {
		if (page.url.searchParams.get('operation') === 'new') started = true;
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

<div class="flex h-screen flex-col bg-gray-100">
	<Toolbar {editor} onDrawSignature={() => (showSignaturePad = true)} />

	{#if editor.errorMessage}
		<div class="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
			{editor.errorMessage}
		</div>
	{/if}

	<div class="relative flex min-h-0 flex-1">
		<PageManager {editor} />
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
			<Canvas {editor} />
			<ZoomControls {editor} />
		{/if}
		<FloatingToolbar {editor} />
	</div>

	{#if showSignaturePad}
		<SignaturePad onuse={onSignatureDrawn} oncancel={() => (showSignaturePad = false)} />
	{/if}

	<FieldPropertiesModal {editor} />
	<DocumentPropertiesModal {editor} />
	<OutlineEditor {editor} />
	<UpsellModal {editor} {signedIn} />
</div>
