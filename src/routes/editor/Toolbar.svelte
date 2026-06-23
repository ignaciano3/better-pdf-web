<script lang="ts">
	import type { EditorState } from './editor.svelte';

	let { editor, onDrawSignature }: { editor: EditorState; onDrawSignature: () => void } = $props();

	async function onPdfChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.loadPdf(file);
		input.value = '';
	}

	async function onSignatureUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const pending = await editor.readRaster(file);
			if (pending) editor.pendingSignature = pending;
		}
		input.value = '';
	}

	async function onImageUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const pending = await editor.readRaster(file);
			if (pending) editor.pendingImage = pending;
		}
		input.value = '';
	}

	const hint = $derived(
		editor.pendingSignature
			? 'Click a page to place your signature.'
			: editor.pendingImage
				? 'Click a page to place your image.'
				: 'Click a page to add text. Drag to move.'
	);
</script>

<header class="flex items-center gap-3 border-b bg-white px-4 py-2 shadow-sm">
	<h1 class="font-semibold">better-pdf editor</h1>
	<span class="text-sm text-gray-500">{hint}</span>
	<div class="ml-auto flex items-center gap-2">
		<label
			class="cursor-pointer rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
		>
			{editor.loadingPdf ? 'Loading…' : 'Upload PDF'}
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
				class="rounded bg-gray-50 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
			>
				New blank
			</button>
		{/if}
		<button
			onclick={onDrawSignature}
			class="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
		>
			Draw signature
		</button>
		<label
			class="cursor-pointer rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
		>
			Upload signature
			<input
				type="file"
				accept="image/png,image/jpeg,.png,.jpg,.jpeg"
				class="hidden"
				onchange={onSignatureUpload}
			/>
		</label>
		<label
			class="cursor-pointer rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
		>
			Upload image
			<input
				type="file"
				accept="image/png,image/jpeg,.png,.jpg,.jpeg"
				class="hidden"
				onchange={onImageUpload}
			/>
		</label>
		{#if editor.selectedText}
			<label class="flex items-center gap-1 text-sm">
				Size
				<input
					type="number"
					min="6"
					max="200"
					bind:value={editor.selectedText.size}
					class="w-16 rounded border px-1 py-0.5"
				/>
			</label>
		{/if}
		{#if editor.selected}
			<button
				onclick={() => editor.removeSelected()}
				class="rounded bg-red-50 px-2 py-1 text-sm text-red-700 hover:bg-red-100"
			>
				Delete
			</button>
		{/if}
		<button
			onclick={() => editor.export()}
			disabled={editor.exporting}
			class="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
		>
			{editor.exporting ? 'Exporting…' : 'Export PDF'}
		</button>
	</div>
</header>
