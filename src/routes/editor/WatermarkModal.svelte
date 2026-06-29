<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { StandardFontName } from '$lib/pdf/types';

	let { editor }: { editor: EditorState } = $props();

	const open = $derived(editor.watermarkModalOpen);

	const fonts: StandardFontName[] = [
		'Helvetica-Bold',
		'Helvetica',
		'Times-Bold',
		'Times-Roman',
		'Courier-Bold'
	];

	function toHex(c: { r: number; g: number; b: number } | undefined): string {
		const v = c ?? { r: 0.5, g: 0.5, b: 0.5 };
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

	// A default watermark used when enabling from scratch.
	function ensure() {
		if (!editor.watermark) {
			editor.watermark = {
				text: 'DRAFT',
				font: 'Helvetica-Bold',
				size: 48,
				opacity: 0.3,
				rotation: 45,
				color: { r: 0.5, g: 0.5, b: 0.5 }
			};
		}
	}

	function close() {
		editor.watermarkModalOpen = false;
	}
	function remove() {
		editor.watermark = null;
		editor.watermarkModalOpen = false;
	}

	// Which mode the current watermark is in (image takes precedence in the build).
	const isImage = $derived(!!editor.watermark?.image);

	/** Switch back to a text watermark, dropping any image fields. */
	function useText() {
		const wm = editor.watermark;
		if (!wm) return;
		delete wm.image;
		delete wm.format;
		delete wm.imageWidth;
		delete wm.imageHeight;
		if (!wm.text.trim()) wm.text = 'DRAFT';
	}

	/** Read a chosen PNG/JPG into the watermark, sized to a sensible default. */
	async function onImageUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const pending = await editor.readRaster(file);
		const wm = editor.watermark;
		if (!pending || !wm) return;
		const width = wm.imageWidth ?? 240;
		wm.image = pending.image;
		wm.format = pending.format;
		wm.imageWidth = width;
		wm.imageHeight = width / pending.aspect;
		wm.text = ''; // image takes over; clear text so the build draws the image
	}

	/** Resize the image watermark, preserving its aspect ratio. */
	function setImageWidth(width: number) {
		const wm = editor.watermark;
		if (!wm || !wm.imageWidth || !wm.imageHeight) return;
		const aspect = wm.imageWidth / wm.imageHeight;
		wm.imageWidth = width;
		wm.imageHeight = width / aspect;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
			<h2 class="mb-4 text-base font-semibold text-slate-900">Watermark</h2>

			{#if !editor.watermark}
				<p class="mb-4 text-sm text-slate-600">No watermark on this document.</p>
				<button
					type="button"
					class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					onclick={ensure}
				>
					Add watermark
				</button>
			{:else}
				{@const wm = editor.watermark}
				<div class="flex flex-col gap-3">
					<!-- Text / image mode toggle. Image takes precedence in the export. -->
					<div class="flex gap-1 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Watermark type">
						<button
							type="button"
							class="flex-1 rounded-md px-3 py-1 text-sm font-medium transition {!isImage
								? 'bg-white text-slate-900 shadow-sm'
								: 'text-slate-500 hover:text-slate-700'}"
							aria-pressed={!isImage}
							onclick={useText}
						>
							Text
						</button>
						<label
							class="flex-1 cursor-pointer rounded-md px-3 py-1 text-center text-sm font-medium transition {isImage
								? 'bg-white text-slate-900 shadow-sm'
								: 'text-slate-500 hover:text-slate-700'}"
						>
							Image
							<input
								type="file"
								accept="image/png,image/jpeg,.png,.jpg,.jpeg"
								class="hidden"
								onchange={onImageUpload}
							/>
						</label>
					</div>

					{#if isImage}
						<p class="text-xs text-slate-500">
							Image watermark — centered, scaled, rotated and translucent on every page.
						</p>
						<label class="flex flex-col gap-1">
							<span class="text-xs font-medium text-slate-600"
								>Width {Math.round(wm.imageWidth ?? 240)} pt</span
							>
							<input
								type="range"
								min="40"
								max="800"
								step="10"
								value={wm.imageWidth ?? 240}
								oninput={(e) => setImageWidth(Number((e.currentTarget as HTMLInputElement).value))}
								aria-label="Watermark image width"
							/>
						</label>
						<label class="flex w-28 flex-col gap-1">
							<span class="text-xs font-medium text-slate-600">Rotation°</span>
							<input
								type="number"
								min="-180"
								max="180"
								class="rounded border border-slate-300 px-2 py-1.5 text-sm"
								value={wm.rotation ?? 45}
								oninput={(e) => (wm.rotation = Number((e.currentTarget as HTMLInputElement).value))}
							/>
						</label>
					{:else}
						<label class="flex flex-col gap-1">
							<span class="text-xs font-medium text-slate-600">Text</span>
							<input
								type="text"
								class="rounded border border-slate-300 px-2 py-1.5 text-sm"
								value={wm.text}
								oninput={(e) => (wm.text = (e.currentTarget as HTMLInputElement).value)}
							/>
						</label>
						<div class="flex items-center gap-3">
							<label class="flex flex-1 flex-col gap-1">
								<span class="text-xs font-medium text-slate-600">Font</span>
								<select
									class="rounded border border-slate-300 px-2 py-1.5 text-sm"
									value={wm.font ?? 'Helvetica-Bold'}
									onchange={(e) =>
										(wm.font = (e.currentTarget as HTMLSelectElement).value as StandardFontName)}
								>
									{#each fonts as f (f)}<option value={f}>{f}</option>{/each}
								</select>
							</label>
							<label class="flex w-24 flex-col gap-1">
								<span class="text-xs font-medium text-slate-600">Size</span>
								<input
									type="number"
									min="6"
									max="300"
									class="rounded border border-slate-300 px-2 py-1.5 text-sm"
									value={wm.size ?? 48}
									oninput={(e) => (wm.size = Number((e.currentTarget as HTMLInputElement).value))}
								/>
							</label>
						</div>
						<div class="flex items-center gap-4">
							<label class="flex items-center gap-2 text-sm">
								<span class="text-xs font-medium text-slate-600">Color</span>
								<input
									type="color"
									value={toHex(wm.color)}
									oninput={(e) => (wm.color = fromHex((e.currentTarget as HTMLInputElement).value))}
									class="h-6 w-6 cursor-pointer rounded border"
									aria-label="Watermark color"
								/>
							</label>
							<label class="flex w-28 flex-col gap-1">
								<span class="text-xs font-medium text-slate-600">Rotation°</span>
								<input
									type="number"
									min="-180"
									max="180"
									class="rounded border border-slate-300 px-2 py-1.5 text-sm"
									value={wm.rotation ?? 45}
									oninput={(e) => (wm.rotation = Number((e.currentTarget as HTMLInputElement).value))}
								/>
							</label>
						</div>
					{/if}

					<label class="flex flex-col gap-1">
						<span class="text-xs font-medium text-slate-600"
							>Opacity {Math.round((wm.opacity ?? 0.3) * 100)}%</span
						>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={wm.opacity ?? 0.3}
							oninput={(e) => (wm.opacity = Number((e.currentTarget as HTMLInputElement).value))}
							aria-label="Watermark opacity"
						/>
					</label>
				</div>
			{/if}

			<div class="mt-5 flex justify-between">
				<button
					type="button"
					class="rounded px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
					disabled={!editor.watermark}
					onclick={remove}
				>
					Remove
				</button>
				<button
					type="button"
					class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					onclick={close}
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}
