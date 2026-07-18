<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { StandardFontName, HFPos, HFSection } from '$lib/pdf/types';
	import { hexToRgb, rgbToHex } from '$lib/color';

	let { editor }: { editor: EditorState } = $props();

	const open = $derived(editor.headerFooterModalOpen);
	const hf = $derived(editor.headerFooter);

	const fonts: StandardFontName[] = [
		'Helvetica',
		'Helvetica-Bold',
		'Times-Roman',
		'Times-Bold',
		'Courier'
	];

	const positions: { key: HFPos; ph: string }[] = [
		{ key: 'left', ph: 'Left' },
		{ key: 'center', ph: 'Center' },
		{ key: 'right', ph: 'Right' }
	];

	// Sensible defaults for a freshly-added section.
	function newSection(slots: Partial<Record<HFPos, string>>): HFSection {
		return { slots: { ...slots }, font: 'Helvetica', size: 10, color: { r: 0, g: 0, b: 0 }, margin: 36 };
	}

	function ensureDoc() {
		if (!editor.headerFooter) editor.headerFooter = { startAt: 1, skipFirst: false };
	}
	function addHeader() {
		ensureDoc();
		if (editor.headerFooter && !editor.headerFooter.header)
			editor.headerFooter.header = newSection({ center: '{title}' });
	}
	function addFooter() {
		ensureDoc();
		if (editor.headerFooter && !editor.headerFooter.footer)
			editor.headerFooter.footer = newSection({ center: 'Page {n} of {total}' });
	}
	function removeHeader() {
		if (editor.headerFooter) delete editor.headerFooter.header;
		dropIfEmpty();
	}
	function removeFooter() {
		if (editor.headerFooter) delete editor.headerFooter.footer;
		dropIfEmpty();
	}
	// Once both sections are gone, drop the whole config so nothing is stamped.
	function dropIfEmpty() {
		const hf = editor.headerFooter;
		if (hf && !hf.header && !hf.footer) editor.headerFooter = null;
	}

	function close() {
		editor.headerFooterModalOpen = false;
	}
	function removeAll() {
		editor.headerFooter = null;
		editor.headerFooterModalOpen = false;
	}

	function setSlot(section: HFSection, key: HFPos, value: string) {
		if (value) section.slots[key] = value;
		else delete section.slots[key];
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
		<div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
			<h2 class="mb-4 text-base font-semibold text-slate-900">Header &amp; footer</h2>

			<div class="flex flex-col gap-4">
				<!-- Header and footer are independent sections, each with own styling. -->
				{#each [{ which: 'header' as const, label: 'Header' }, { which: 'footer' as const, label: 'Footer' }] as sec (sec.which)}
					{@const section = hf?.[sec.which]}
					<fieldset class="rounded-lg border border-slate-200 p-3">
						<div class="mb-2 flex items-center justify-between">
							<span class="text-sm font-medium text-slate-700">{sec.label}</span>
							{#if section}
								<button
									type="button"
									class="text-xs font-medium text-red-700 hover:underline"
									onclick={() => (sec.which === 'header' ? removeHeader() : removeFooter())}
								>
									Remove
								</button>
							{:else}
								<button
									type="button"
									class="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
									onclick={() => (sec.which === 'header' ? addHeader() : addFooter())}
								>
									Add {sec.label}
								</button>
							{/if}
						</div>

						{#if section}
							<div class="grid grid-cols-3 gap-2">
								{#each positions as p (p.key)}
									<input
										type="text"
										placeholder={p.ph}
										class="rounded border border-slate-300 px-2 py-1.5 text-sm"
										value={section.slots[p.key] ?? ''}
										oninput={(e) =>
											setSlot(section, p.key, (e.currentTarget as HTMLInputElement).value)}
										aria-label="{sec.label} {p.ph}"
									/>
								{/each}
							</div>

							<div class="mt-3 flex flex-wrap items-end gap-3">
								<label class="flex flex-col gap-1">
									<span class="text-xs font-medium text-slate-600">Font</span>
									<select
										class="rounded border border-slate-300 px-2 py-1.5 text-sm"
										value={section.font ?? 'Helvetica'}
										onchange={(e) =>
											(section.font = (e.currentTarget as HTMLSelectElement).value as StandardFontName)}
									>
										{#each fonts as f (f)}<option value={f}>{f}</option>{/each}
									</select>
								</label>
								<label class="flex w-16 flex-col gap-1">
									<span class="text-xs font-medium text-slate-600">Size</span>
									<input
										type="number"
										min="6"
										max="72"
										class="rounded border border-slate-300 px-2 py-1.5 text-sm"
										value={section.size ?? 10}
										oninput={(e) => (section.size = Number((e.currentTarget as HTMLInputElement).value))}
									/>
								</label>
								<label class="flex w-20 flex-col gap-1">
									<span class="text-xs font-medium text-slate-600">Margin</span>
									<input
										type="number"
										min="0"
										max="200"
										class="rounded border border-slate-300 px-2 py-1.5 text-sm"
										value={section.margin ?? 36}
										oninput={(e) =>
											(section.margin = Number((e.currentTarget as HTMLInputElement).value))}
									/>
								</label>
								<label class="flex items-center gap-2 text-sm">
									<span class="text-xs font-medium text-slate-600">Color</span>
									<input
										type="color"
										value={rgbToHex(section.color ?? { r: 0, g: 0, b: 0 })}
										oninput={(e) =>
											(section.color = hexToRgb((e.currentTarget as HTMLInputElement).value))}
										class="h-6 w-6 cursor-pointer rounded border"
										aria-label="{sec.label} color"
									/>
								</label>
							</div>
						{/if}
					</fieldset>
				{/each}

				{#if hf}
					<p class="text-xs text-slate-500">
						Tokens: <code class="rounded bg-slate-100 px-1">{'{n}'}</code> page number,
						<code class="rounded bg-slate-100 px-1">{'{total}'}</code> page count,
						<code class="rounded bg-slate-100 px-1">{'{title}'}</code> document title.
					</p>

					<div class="flex flex-wrap items-end gap-4">
						<label class="flex w-28 flex-col gap-1">
							<span class="text-xs font-medium text-slate-600">Start number</span>
							<input
								type="number"
								min="0"
								class="rounded border border-slate-300 px-2 py-1.5 text-sm"
								value={hf.startAt ?? 1}
								oninput={(e) => (hf.startAt = Number((e.currentTarget as HTMLInputElement).value))}
							/>
						</label>
						<label class="flex items-center gap-2 text-sm text-slate-700">
							<input
								type="checkbox"
								checked={hf.skipFirst ?? false}
								onchange={(e) => (hf.skipFirst = (e.currentTarget as HTMLInputElement).checked)}
							/>
							Skip first page
						</label>
					</div>
				{:else}
					<p class="text-sm text-slate-600">No header or footer on this document.</p>
				{/if}
			</div>

			<div class="mt-5 flex justify-between">
				<button
					type="button"
					class="rounded px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
					disabled={!editor.headerFooter}
					onclick={removeAll}
				>
					Remove all
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
