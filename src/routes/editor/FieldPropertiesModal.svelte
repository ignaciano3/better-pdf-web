<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { FieldElement } from '$lib/pdf/types';

	let { editor }: { editor: EditorState } = $props();

	const field = $derived(editor.selectedField);
	const open = $derived(editor.fieldModalOpen && field !== null);

	// Local editable copy of the name so an invalid (duplicate/empty) value blocks
	// save without corrupting the live element.
	let nameDraft = $state('');
	let lastId = $state<string | null>(null);

	$effect(() => {
		if (field && field.id !== lastId) {
			nameDraft = field.name;
			lastId = field.id;
		}
	});

	const nameError = $derived.by(() => {
		if (!field) return null;
		const n = nameDraft.trim();
		if (n.length === 0) return 'Name is required.';
		if (n.length > 256) return 'Name is too long.';
		if (editor.fieldNameTaken(n, field.id)) return 'A field with this name already exists.';
		return null;
	});

	// Text color is meaningful only for fields that render value text.
	const hasTextColor = $derived(
		field
			? field.field === 'text' ||
					field.field === 'dropdown' ||
					field.field === 'combo' ||
					field.field === 'listbox'
			: false
	);

	const hasOptions = $derived(
		field
			? field.field === 'dropdown' ||
					field.field === 'radio' ||
					field.field === 'listbox' ||
					field.field === 'combo'
			: false
	);

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

	function save() {
		if (!field || nameError) return;
		field.name = nameDraft.trim();
		editor.fieldModalOpen = false;
	}
	function close() {
		editor.fieldModalOpen = false;
	}
	function del() {
		editor.fieldModalOpen = false;
		editor.removeSelected();
	}

	function addOption(f: FieldElement) {
		// Radios also need a layout slot for the new button; delegate so the bar and
		// the modal stay in sync.
		if (f.field === 'radio') {
			editor.addRadioOption(f);
			return;
		}
		f.options = [...(f.options ?? []), `Option ${(f.options?.length ?? 0) + 1}`];
	}
	function removeOption(f: FieldElement, i: number) {
		f.options = (f.options ?? []).filter((_, idx) => idx !== i);
		if (f.field === 'radio' && f.radioLayout) {
			f.radioLayout = f.radioLayout.filter((_, idx) => idx !== i);
		}
	}
	function moveOption(f: FieldElement, i: number, dir: -1 | 1) {
		const opts = [...(f.options ?? [])];
		const j = i + dir;
		if (j < 0 || j >= opts.length) return;
		[opts[i], opts[j]] = [opts[j] as string, opts[i] as string];
		f.options = opts;
		// Positions belong to the slot, not the value: swap them alongside.
		if (f.field === 'radio' && f.radioLayout) {
			const layout = [...f.radioLayout];
			if (layout[i] && layout[j]) {
				[layout[i], layout[j]] = [layout[j], layout[i]];
				f.radioLayout = layout;
			}
		}
	}
	function setOption(f: FieldElement, i: number, value: string) {
		const opts = [...(f.options ?? [])];
		opts[i] = value;
		f.options = opts;
	}
</script>

{#if open && field}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div class="max-h-[85vh] w-full max-w-md overflow-auto rounded-xl bg-white p-5 shadow-xl">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-base font-semibold text-gray-900">Field properties</h2>
				<span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{field.field}</span>
			</div>

			<label class="mb-1 block text-sm font-medium text-gray-700" for="field-name">Name</label>
			<input
				id="field-name"
				type="text"
				class="w-full rounded border px-2 py-1 text-sm {nameError
					? 'border-red-400'
					: 'border-gray-300'}"
				bind:value={nameDraft}
			/>
			{#if nameError}
				<p class="mt-1 text-xs text-red-600" role="alert">{nameError}</p>
			{/if}

			<div class="mt-3 flex gap-4">
				<label class="flex items-center gap-1.5 text-sm">
					<input type="checkbox" bind:checked={field.required} /> Required
				</label>
				<label class="flex items-center gap-1.5 text-sm">
					<input type="checkbox" bind:checked={field.readOnly} /> Read-only
				</label>
			</div>

			<label class="mt-3 mb-1 block text-sm font-medium text-gray-700" for="field-tooltip">
				Tooltip
			</label>
			<input
				id="field-tooltip"
				type="text"
				class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
				bind:value={field.tooltip}
			/>

			<div class="mt-3 flex items-center gap-4">
				<label class="flex items-center gap-1.5 text-sm">
					Border
					<input
						type="checkbox"
						checked={!!field.border}
						onchange={(e) => {
							if ((e.currentTarget as HTMLInputElement).checked) {
								field.border = { color: { r: 0, g: 0, b: 0 }, width: 1 };
							} else {
								delete field.border;
							}
						}}
					/>
				</label>
				{#if field.border}
					<input
						type="color"
						value={toHex(field.border.color)}
						oninput={(e) => {
							if (field.border)
								field.border.color = fromHex((e.currentTarget as HTMLInputElement).value);
						}}
						class="h-6 w-6 cursor-pointer rounded border"
						aria-label="Border color"
					/>
					<input
						type="number"
						min="0"
						step="0.5"
						value={field.border.width ?? 1}
						oninput={(e) => {
							if (field.border)
								field.border.width = Number((e.currentTarget as HTMLInputElement).value);
						}}
						class="w-16 rounded border border-gray-300 px-1 py-0.5 text-sm"
						aria-label="Border width"
					/>
				{/if}
			</div>

			<div class="mt-3 flex items-center gap-4">
				<label class="flex items-center gap-1.5 text-sm">
					Background
					<input
						type="checkbox"
						checked={!!field.background}
						onchange={(e) => {
							if ((e.currentTarget as HTMLInputElement).checked) {
								field.background = { r: 1, g: 1, b: 1 };
							} else {
								delete field.background;
							}
						}}
					/>
				</label>
				{#if field.background}
					<input
						type="color"
						value={toHex(field.background)}
						oninput={(e) =>
							(field.background = fromHex((e.currentTarget as HTMLInputElement).value))}
						class="h-6 w-6 cursor-pointer rounded border"
						aria-label="Background color"
					/>
				{/if}
			</div>

			{#if hasTextColor}
				<div class="mt-3 flex items-center gap-4">
					<label class="flex items-center gap-1.5 text-sm">
						Text color
						<input
							type="checkbox"
							checked={!!field.textColor}
							onchange={(e) => {
								if ((e.currentTarget as HTMLInputElement).checked) {
									field.textColor = { r: 0, g: 0, b: 0 };
								} else {
									delete field.textColor;
								}
							}}
						/>
					</label>
					{#if field.textColor}
						<input
							type="color"
							value={toHex(field.textColor)}
							oninput={(e) =>
								(field.textColor = fromHex((e.currentTarget as HTMLInputElement).value))}
							class="h-6 w-6 cursor-pointer rounded border"
							aria-label="Text color"
						/>
					{/if}
				</div>
			{/if}

			{#if field.field === 'text'}
				<label class="mt-3 mb-1 block text-sm font-medium text-gray-700" for="field-placeholder">
					Placeholder
				</label>
				<input
					id="field-placeholder"
					type="text"
					class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
					bind:value={field.placeholder}
				/>
				<div class="mt-3 flex items-center gap-4">
					<label class="flex items-center gap-2 text-sm">
						Max length
						<input
							type="number"
							min="0"
							class="w-20 rounded border border-gray-300 px-1 py-0.5 text-sm"
							value={field.maxLength ?? ''}
							oninput={(e) => {
								const v = (e.currentTarget as HTMLInputElement).value;
								if (v === '') delete field.maxLength;
								else field.maxLength = Number(v);
							}}
						/>
					</label>
					<label class="flex items-center gap-1.5 text-sm">
						<input type="checkbox" bind:checked={field.multiline} /> Multiline
					</label>
				</div>
				<label class="mt-3 mb-1 block text-sm font-medium text-gray-700" for="field-default">
					Default value
				</label>
				<input
					id="field-default"
					type="text"
					class="w-full rounded border border-gray-300 px-2 py-1 text-sm"
					bind:value={field.value}
				/>
			{/if}

			{#if hasOptions}
				<div class="mt-3">
					<div class="mb-1 flex items-center justify-between">
						<span class="text-sm font-medium text-gray-700">Options</span>
						<button
							class="rounded bg-gray-100 px-2 py-0.5 text-xs hover:bg-gray-200"
							onclick={() => addOption(field)}
						>
							Add
						</button>
					</div>
					<div class="flex flex-col gap-1">
						{#each field.options ?? [] as opt, i (i)}
							<div class="flex items-center gap-1">
								<input
									type="text"
									class="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
									value={opt}
									oninput={(e) => setOption(field, i, (e.currentTarget as HTMLInputElement).value)}
								/>
								<button
									class="rounded px-1.5 text-xs text-gray-500 hover:bg-gray-100"
									aria-label="Move up"
									onclick={() => moveOption(field, i, -1)}>↑</button
								>
								<button
									class="rounded px-1.5 text-xs text-gray-500 hover:bg-gray-100"
									aria-label="Move down"
									onclick={() => moveOption(field, i, 1)}>↓</button
								>
								<button
									class="rounded px-1.5 text-xs text-red-600 hover:bg-red-50"
									aria-label="Remove option"
									onclick={() => removeOption(field, i)}>✕</button
								>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="mt-5 flex items-center justify-between">
				<button
					class="rounded px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
					onclick={del}
				>
					Delete field
				</button>
				<div class="flex gap-2">
					<button
						class="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
						onclick={close}
					>
						Cancel
					</button>
					<button
						class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
						disabled={!!nameError}
						onclick={save}
					>
						Done
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
