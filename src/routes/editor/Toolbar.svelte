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
		editor.shapeTool
			? `Drag on a page to draw a ${editor.shapeTool}.`
			: editor.pendingSignature
				? 'Click a page to place your signature.'
				: editor.pendingImage
					? 'Click a page to place your image.'
					: 'Click a page to add text. Drag to move.'
	);

	/** #rrggbb (0..255) ⇄ {r,g,b} (0..1) bridges for the color inputs. */
	function toHex(c: { r: number; g: number; b: number }): string {
		const h = (v: number) =>
			Math.round(Math.max(0, Math.min(1, v)) * 255)
				.toString(16)
				.padStart(2, '0');
		return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
	}
	function fromHex(hex: string): { r: number; g: number; b: number } {
		return {
			r: parseInt(hex.slice(1, 3), 16) / 255,
			g: parseInt(hex.slice(3, 5), 16) / 255,
			b: parseInt(hex.slice(5, 7), 16) / 255
		};
	}

	const shapeTools = [
		{ kind: 'line', label: 'Line' },
		{ kind: 'rectangle', label: 'Rect' },
		{ kind: 'ellipse', label: 'Ellipse' }
	] as const;
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
		<div class="flex items-center gap-1 rounded bg-gray-100 p-0.5">
			{#each shapeTools as tool (tool.kind)}
				<button
					onclick={() => editor.setShapeTool(tool.kind)}
					class="rounded px-2 py-1 text-sm font-medium {editor.shapeTool === tool.kind
						? 'bg-blue-600 text-white'
						: 'text-gray-700 hover:bg-gray-200'}"
				>
					{tool.label}
				</button>
			{/each}
			<label class="flex items-center gap-1 px-1 text-sm" title="Shape stroke color">
				<input
					type="color"
					value={toHex(editor.shapeStroke)}
					oninput={(e) =>
						(editor.shapeStroke = fromHex((e.currentTarget as HTMLInputElement).value))}
					class="h-6 w-6 cursor-pointer rounded border"
				/>
			</label>
		</div>
		{#if editor.selectedShape}
			{@const sh = editor.selectedShape}
			<label class="flex items-center gap-1 text-sm" title="Stroke color">
				Stroke
				<input
					type="color"
					value={toHex(sh.strokeColor ?? { r: 0, g: 0, b: 0 })}
					oninput={(e) => (sh.strokeColor = fromHex((e.currentTarget as HTMLInputElement).value))}
					class="h-6 w-6 cursor-pointer rounded border"
				/>
			</label>
			{#if sh.shape !== 'line'}
				<label class="flex items-center gap-1 text-sm" title="Fill color">
					<input
						type="checkbox"
						checked={Boolean(sh.fillColor)}
						onchange={(e) => {
							if ((e.currentTarget as HTMLInputElement).checked) {
								sh.fillColor = { r: 0.8, g: 0.8, b: 0.8 };
							} else {
								delete sh.fillColor;
							}
						}}
					/>
					Fill
					{#if sh.fillColor}
						<input
							type="color"
							value={toHex(sh.fillColor)}
							oninput={(e) => (sh.fillColor = fromHex((e.currentTarget as HTMLInputElement).value))}
							class="h-6 w-6 cursor-pointer rounded border"
						/>
					{/if}
				</label>
			{/if}
		{/if}
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
