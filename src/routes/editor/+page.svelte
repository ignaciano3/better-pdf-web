<script lang="ts">
	import SignaturePad from '$lib/components/SignaturePad.svelte';
	import { EditorState } from './editor.svelte';
	import Toolbar from './Toolbar.svelte';
	import Canvas from './Canvas.svelte';

	const editor = new EditorState();
	let showSignaturePad = $state(false);

	function onSignatureDrawn(png: Uint8Array, aspect: number) {
		editor.pendingSignature = { image: png, format: 'png', aspect };
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

	<Canvas {editor} />

	{#if showSignaturePad}
		<SignaturePad onuse={onSignatureDrawn} oncancel={() => (showSignaturePad = false)} />
	{/if}
</div>
