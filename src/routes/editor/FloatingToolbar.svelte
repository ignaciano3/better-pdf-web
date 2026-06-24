<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { SCALE } from './constants';
	import type { StandardFontName } from '$lib/pdf/types';

	let { editor }: { editor: EditorState } = $props();

	const fonts: StandardFontName[] = [
		'Helvetica',
		'Helvetica-Bold',
		'Helvetica-Oblique',
		'Times-Roman',
		'Times-Bold',
		'Times-Italic',
		'Courier',
		'Courier-Bold'
	];

	function toHex(c: { r: number; g: number; b: number } | undefined): string {
		const v = c ?? { r: 0, g: 0, b: 0 };
		const h = (n: number) =>
			Math.round(Math.max(0, Math.min(1, n)) * 255)
				.toString(16)
				.padStart(2, '0');
		return `#${h(v.r)}${h(v.g)}${h(v.b)}`;
	}
	function fromHex(hex: string): { r: number; g: number; b: number } {
		return {
			r: parseInt(hex.slice(1, 3), 16) / 255,
			g: parseInt(hex.slice(3, 5), 16) / 255,
			b: parseInt(hex.slice(5, 7), 16) / 255
		};
	}

	// Anchor just above the selection's top-left, in canvas px.
	const pos = $derived(
		editor.selected
			? { left: editor.selected.x * SCALE, top: editor.selected.y * SCALE - 44 }
			: null
	);
</script>

{#if editor.selected && pos}
	<div
		class="absolute z-20 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg"
		style="left: {pos.left}px; top: {Math.max(pos.top, 0)}px;"
	>
		{#if editor.selectedText}
			{@const t = editor.selectedText}
			<select
				class="rounded border px-1 py-0.5 text-sm"
				value={t.font ?? 'Helvetica'}
				onchange={(e) =>
					(t.font = (e.currentTarget as HTMLSelectElement).value as StandardFontName)}
			>
				{#each fonts as f (f)}
					<option value={f}>{f}</option>
				{/each}
			</select>
			<input
				type="number"
				min="6"
				max="200"
				bind:value={t.size}
				class="w-14 rounded border px-1 py-0.5 text-sm"
				aria-label="Font size"
			/>
			<input
				type="color"
				value={toHex(t.color)}
				oninput={(e) => (t.color = fromHex((e.currentTarget as HTMLInputElement).value))}
				class="h-6 w-6 cursor-pointer rounded border"
				aria-label="Text color"
			/>
		{/if}

		{#if editor.selectedShape}
			{@const sh = editor.selectedShape}
			<input
				type="color"
				value={toHex(sh.strokeColor)}
				oninput={(e) => (sh.strokeColor = fromHex((e.currentTarget as HTMLInputElement).value))}
				class="h-6 w-6 cursor-pointer rounded border"
				aria-label="Stroke color"
			/>
			{#if sh.shape !== 'line'}
				<label class="flex items-center gap-1 text-sm">
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
				</label>
				{#if sh.fillColor}
					<input
						type="color"
						value={toHex(sh.fillColor)}
						oninput={(e) => (sh.fillColor = fromHex((e.currentTarget as HTMLInputElement).value))}
						class="h-6 w-6 cursor-pointer rounded border"
						aria-label="Fill color"
					/>
				{/if}
			{/if}
		{/if}

		{#if editor.selectedField}
			<button
				onclick={() => (editor.fieldModalOpen = true)}
				class="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
				aria-label="Field settings"
				title="Field settings"
			>
				⚙ Settings
			</button>
		{/if}

		<button
			onclick={() => editor.duplicateSelected()}
			class="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
		>
			Duplicate
		</button>
		<button
			onclick={() => editor.removeSelected()}
			class="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50"
		>
			Delete
		</button>
	</div>
{/if}
