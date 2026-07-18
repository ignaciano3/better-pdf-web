<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import { SCALE } from './constants';
	import type { StandardFontName } from '$lib/pdf/types';
	import { hexToRgb, rgbToHex } from '$lib/color';

	// `pageHeight` is the selected element's page height in unzoomed canvas px,
	// used to bottom-anchor the bar above the element (so it never covers tall
	// fields like radio groups, list boxes or signatures).
	let { editor, pageHeight = 0 }: { editor: EditorState; pageHeight?: number } = $props();

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

	// Top-left anchor point of the selection (unzoomed points). For a radio group
	// that's the top-most/left-most button so the bar clears every option.
	const anchor = $derived.by(() => {
		const s = editor.selected;
		if (!s) return null;
		const f = editor.selectedField;
		if (f?.field === 'radio' && f.radioLayout && f.radioLayout.length > 0) {
			return {
				x: Math.min(...f.radioLayout.map((p) => p.x)),
				y: Math.min(...f.radioLayout.map((p) => p.y))
			};
		}
		return { x: s.x, y: s.y };
	});

	// Non-radio fields draw a drag-chrome strip 12px above their top edge
	// (FieldOverlay `-top-3`); clear it so the bar doesn't sit on the strip.
	const CHROME = $derived(editor.selectedField && editor.selectedField.field !== 'radio' ? 12 : 0);

	// Sit the bar's BOTTOM a constant on-screen gap above the element's top (plus
	// any chrome), so it grows upward and never overlaps the element regardless of
	// its height. The gap is divided by zoom because the parent applies CSS `zoom`.
	const GAP = 10;
	const pos = $derived(
		anchor
			? {
					left: anchor.x * SCALE,
					// CSS `bottom` measured from the page's bottom edge.
					bottom: pageHeight - anchor.y * SCALE + CHROME + GAP / editor.zoom
				}
			: null
	);

	async function onFontUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		const t = editor.selectedText;
		if (file && t) await editor.applyCustomFont(file, t);
		input.value = '';
	}
</script>

{#if editor.selected && pos}
	<!-- Counter-scale by 1/zoom so the bar keeps a normal on-screen size even though
	     the parent page wrapper is CSS-zoomed. We use `zoom` (not `transform`)
	     because nested `zoom` cancels the ancestor zoom for NATIVE control popups
	     too (e.g. the color picker), which `transform` does not — otherwise the
	     color-picker dialog opens magnified by the page zoom. `left`/`bottom` are
	     multiplied by zoom so the bar's own zoom scales them back to the anchor. -->
	<div
		class="absolute z-20 flex w-max items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 whitespace-nowrap shadow-lg"
		style="left: {pos.left * editor.zoom}px; bottom: {pos.bottom * editor.zoom}px; zoom: {1 /
			editor.zoom};"
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
				value={rgbToHex(t.color)}
				oninput={(e) => (t.color = hexToRgb((e.currentTarget as HTMLInputElement).value))}
				class="swatch h-6 w-6 cursor-pointer rounded border"
				aria-label="Text color"
			/>
			{#if t.fontId}
				<span
					class="max-w-24 truncate text-xs text-slate-600"
					title={editor.embeddedFonts[t.fontId]?.name}
				>
					{editor.embeddedFonts[t.fontId]?.name ?? 'Custom font'}
				</span>
				<button
					onclick={() => editor.clearCustomFont(t)}
					class="rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
					title="Revert to a standard font"
				>
					Standard
				</button>
			{:else}
				<label
					class="cursor-pointer rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
					title="Upload a .ttf or .otf font"
				>
					Upload font
					<input
						type="file"
						accept=".ttf,.otf,font/ttf,font/otf"
						class="hidden"
						onchange={onFontUpload}
					/>
				</label>
			{/if}
		{/if}

		{#if editor.selectedShape}
			{@const sh = editor.selectedShape}
			<input
				type="color"
				value={rgbToHex(sh.strokeColor)}
				oninput={(e) => (sh.strokeColor = hexToRgb((e.currentTarget as HTMLInputElement).value))}
				class="swatch h-6 w-6 cursor-pointer rounded border"
				aria-label="Stroke color"
			/>
			<label class="flex items-center gap-1 text-sm" title="Dashed stroke">
				<input
					type="checkbox"
					checked={Boolean(sh.dash && sh.dash.length > 0)}
					onchange={(e) => {
						if ((e.currentTarget as HTMLInputElement).checked) sh.dash = [4, 2];
						else delete sh.dash;
					}}
				/>
				Dash
			</label>
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
						value={rgbToHex(sh.fillColor)}
						oninput={(e) => (sh.fillColor = hexToRgb((e.currentTarget as HTMLInputElement).value))}
						class="swatch h-6 w-6 cursor-pointer rounded border"
						aria-label="Fill color"
					/>
				{/if}
			{/if}
		{/if}

		{#if editor.selectedMarkup}
			{@const mk = editor.selectedMarkup}
			<input
				type="color"
				value={rgbToHex(mk.color)}
				oninput={(e) => (mk.color = hexToRgb((e.currentTarget as HTMLInputElement).value))}
				class="swatch h-6 w-6 cursor-pointer rounded border"
				aria-label="Markup color"
			/>
			{#if mk.markup === 'highlight'}
				<label class="flex items-center gap-1 text-sm" title="Highlight opacity">
					Opacity
					<input
						type="range"
						min="0.1"
						max="1"
						step="0.05"
						value={mk.opacity ?? 0.4}
						oninput={(e) => (mk.opacity = Number((e.currentTarget as HTMLInputElement).value))}
						class="w-20"
						aria-label="Highlight opacity"
					/>
				</label>
			{:else}
				<input
					type="number"
					min="0.5"
					max="20"
					step="0.5"
					value={mk.thickness ?? 1.5}
					oninput={(e) => (mk.thickness = Number((e.currentTarget as HTMLInputElement).value))}
					class="w-14 rounded border px-1 py-0.5 text-sm"
					aria-label="Line thickness"
				/>
			{/if}
		{/if}

		{#if editor.selectedVector}
			{@const v = editor.selectedVector}
			<input
				type="color"
				value={rgbToHex(v.strokeColor)}
				oninput={(e) => (v.strokeColor = hexToRgb((e.currentTarget as HTMLInputElement).value))}
				class="swatch h-6 w-6 cursor-pointer rounded border"
				aria-label="Stroke color"
			/>
			<input
				type="number"
				min="0"
				max="50"
				step="0.5"
				value={v.strokeWidth ?? 1}
				oninput={(e) => (v.strokeWidth = Number((e.currentTarget as HTMLInputElement).value))}
				class="w-14 rounded border px-1 py-0.5 text-sm"
				aria-label="Stroke width"
			/>
			<label class="flex items-center gap-1 text-sm" title="Dashed stroke">
				<input
					type="checkbox"
					checked={Boolean(v.dash && v.dash.length > 0)}
					onchange={(e) => {
						if ((e.currentTarget as HTMLInputElement).checked) v.dash = [4, 2];
						else delete v.dash;
					}}
				/>
				Dash
			</label>
			<label class="flex items-center gap-1 text-sm">
				<input
					type="checkbox"
					checked={Boolean(v.fillColor)}
					onchange={(e) => {
						if ((e.currentTarget as HTMLInputElement).checked) {
							v.fillColor = { r: 0.8, g: 0.8, b: 0.8 };
						} else {
							delete v.fillColor;
						}
					}}
				/>
				Fill
			</label>
			{#if v.fillColor}
				<input
					type="color"
					value={rgbToHex(v.fillColor)}
					oninput={(e) => (v.fillColor = hexToRgb((e.currentTarget as HTMLInputElement).value))}
					class="swatch h-6 w-6 cursor-pointer rounded border"
					aria-label="Fill color"
				/>
			{/if}
			<label class="flex items-center gap-1 text-sm" title="Opacity">
				α
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={v.opacity ?? 1}
					oninput={(e) => (v.opacity = Number((e.currentTarget as HTMLInputElement).value))}
					class="w-16"
					aria-label="Opacity"
				/>
			</label>
		{/if}

		{#if editor.selectedLink}
			{@const ln = editor.selectedLink}
			<label class="flex items-center gap-1 text-sm">
				<input
					type="radio"
					name="link-target"
					checked={ln.url !== undefined}
					onchange={() => {
						delete ln.goToPage;
						ln.url = ln.url ?? '';
					}}
				/>
				URL
			</label>
			<label class="flex items-center gap-1 text-sm">
				<input
					type="radio"
					name="link-target"
					checked={ln.goToPage !== undefined}
					onchange={() => {
						delete ln.url;
						ln.goToPage = ln.goToPage ?? 0;
					}}
				/>
				Page
			</label>
			{#if ln.url !== undefined}
				<input
					type="url"
					placeholder="https://…"
					value={ln.url}
					oninput={(e) => (ln.url = (e.currentTarget as HTMLInputElement).value)}
					class="w-44 rounded border px-1 py-0.5 text-sm"
					aria-label="Link URL"
				/>
			{:else}
				<!-- Shown 1-based for humans; stored 0-based for the PDF (drawLink). -->
				<input
					type="number"
					min="1"
					placeholder="page"
					value={(ln.goToPage ?? 0) + 1}
					oninput={(e) =>
						(ln.goToPage = Math.max(
							0,
							Math.floor(Number((e.currentTarget as HTMLInputElement).value)) - 1
						))}
					class="w-24 rounded border px-1 py-0.5 text-sm"
					aria-label="Go to page"
				/>
			{/if}
		{/if}

		{#if editor.selectedRaster}
			{@const r = editor.selectedRaster}
			<!-- Manual width/height so an image/signature can be sized precisely. -->
			<label class="flex items-center gap-1 text-sm" title="Width (points)">
				W
				<input
					type="number"
					min="4"
					value={Math.round(r.width)}
					oninput={(e) =>
						editor.setRasterSize(r, Number((e.currentTarget as HTMLInputElement).value), undefined)}
					class="w-16 rounded border px-1 py-0.5 text-sm"
					aria-label="Width"
				/>
			</label>
			<label class="flex items-center gap-1 text-sm" title="Height (points)">
				H
				<input
					type="number"
					min="4"
					value={Math.round(r.height)}
					oninput={(e) =>
						editor.setRasterSize(r, undefined, Number((e.currentTarget as HTMLInputElement).value))}
					class="w-16 rounded border px-1 py-0.5 text-sm"
					aria-label="Height"
				/>
			</label>
			<label class="flex items-center gap-1 text-sm" title="Opacity">
				α
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={r.opacity ?? 1}
					oninput={(e) => (r.opacity = Number((e.currentTarget as HTMLInputElement).value))}
					class="w-16"
					aria-label="Opacity"
				/>
			</label>
			<label class="flex items-center gap-1 text-sm" title="Rotation (degrees, counter-clockwise)">
				∠
				<input
					type="number"
					step="1"
					value={r.rotate ?? 0}
					oninput={(e) => (r.rotate = Number((e.currentTarget as HTMLInputElement).value))}
					class="w-16 rounded border px-1 py-0.5 text-sm"
					aria-label="Rotation"
				/>
			</label>
		{/if}

		{#if editor.selectedField}
			{@const fld = editor.selectedField}
			{#if fld.field === 'text' || fld.field === 'dropdown' || fld.field === 'combo' || fld.field === 'listbox'}
				<input
					type="color"
					value={rgbToHex(fld.textColor)}
					oninput={(e) => (fld.textColor = hexToRgb((e.currentTarget as HTMLInputElement).value))}
					class="swatch h-6 w-6 cursor-pointer rounded border"
					aria-label="Text color"
					title="Text color"
				/>
			{/if}
			{#if editor.selectedField.field === 'radio'}
				<button
					onclick={() => editor.addRadioOption(editor.selectedField!)}
					class="rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
					title="Add another radio option"
				>
					+ Option
				</button>
			{/if}
			<button
				onclick={() => (editor.fieldModalOpen = true)}
				class="rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
				aria-label="Field settings"
				title="Field settings"
			>
				⚙ Settings
			</button>
		{/if}

		<button
			onclick={() => editor.duplicateSelected()}
			class="rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
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

<style>
	/* Native colour inputs carry a bordered swatch and a UA minimum size that
	   Firefox doesn't shrink to the w-6/h-6 box, so under the bar's counter-scale
	   the picker balloons. Strip the native chrome so the box is exactly its set
	   size cross-browser. */
	.swatch {
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		padding: 0;
		min-width: 0;
		min-height: 0;
	}
	.swatch::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	.swatch::-webkit-color-swatch {
		border: none;
		border-radius: 0.25rem;
	}
	.swatch::-moz-color-swatch {
		border: none;
		border-radius: 0.25rem;
	}
</style>
