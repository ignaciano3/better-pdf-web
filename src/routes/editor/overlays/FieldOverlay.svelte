<script lang="ts">
	import type { EditElement, FieldElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState } = $props();
	const field = $derived(el as FieldElement);
	const selected = $derived(editor.selectedId === el.id);

	const w = $derived(Math.max(field.width, 0) * SCALE);
	const h = $derived(Math.max(field.height, 0) * SCALE);

	// Drag from the wrapper chrome (not the inner control) so typing still works.
	function onChromeDown(e: PointerEvent) {
		editor.startDrag(e, field);
	}

	function readSig(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			field.value = reader.result as string;
		};
		reader.readAsDataURL(file);
		input.value = '';
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute {selected ? 'ring-2 ring-blue-400' : 'ring-1 ring-blue-300/60'}"
	style="left: {field.x * SCALE}px; top: {field.y * SCALE}px; width: {w}px; height: {h}px;"
	title={field.tooltip ?? field.name}
>
	<!-- Drag chrome strip across the top so the inner control stays usable. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<span
		class="absolute -top-3 left-0 h-3 w-full cursor-move bg-blue-300/70"
		onpointerdown={onChromeDown}
	></span>

	{#if field.field === 'text'}
		{#if field.multiline}
			<textarea
				class="h-full w-full resize-none rounded border border-gray-300 bg-white/90 px-1 text-xs"
				placeholder={field.placeholder ?? ''}
				maxlength={field.maxLength}
				readonly={field.readOnly}
				bind:value={field.value}
				onfocus={() => editor.select(el.id)}></textarea>
		{:else}
			<input
				type="text"
				class="h-full w-full rounded border border-gray-300 bg-white/90 px-1 text-xs"
				placeholder={field.placeholder ?? ''}
				maxlength={field.maxLength}
				readonly={field.readOnly}
				bind:value={field.value}
				onfocus={() => editor.select(el.id)}
			/>
		{/if}
	{:else if field.field === 'checkbox'}
		<input
			type="checkbox"
			class="h-full w-full cursor-pointer"
			disabled={field.readOnly}
			checked={!!field.value}
			onchange={(e) => {
				field.value = (e.currentTarget as HTMLInputElement).checked ? 'Yes' : '';
				editor.select(el.id);
			}}
		/>
	{:else if field.field === 'radio'}
		<div
			class="flex h-full w-full flex-col gap-0.5 overflow-auto rounded border border-gray-300 bg-white/90 p-0.5 text-xs"
		>
			{#each field.options ?? [] as opt (opt)}
				<label class="flex items-center gap-1">
					<input
						type="radio"
						name={field.id}
						value={opt}
						disabled={field.readOnly}
						checked={field.value === opt}
						onchange={() => {
							field.value = opt;
							editor.select(el.id);
						}}
					/>
					{opt}
				</label>
			{/each}
		</div>
	{:else if field.field === 'dropdown' || field.field === 'combo'}
		<select
			class="h-full w-full rounded border border-gray-300 bg-white/90 px-1 text-xs"
			disabled={field.readOnly}
			bind:value={field.value}
			onfocus={() => editor.select(el.id)}
		>
			<option value="">—</option>
			{#each field.options ?? [] as opt (opt)}
				<option value={opt}>{opt}</option>
			{/each}
		</select>
	{:else if field.field === 'listbox'}
		<select
			multiple
			class="h-full w-full rounded border border-gray-300 bg-white/90 px-1 text-xs"
			disabled={field.readOnly}
			onfocus={() => editor.select(el.id)}
			onchange={(e) => {
				const sel = Array.from((e.currentTarget as HTMLSelectElement).selectedOptions).map(
					(o) => o.value
				);
				field.value = sel[0] ?? '';
				editor.select(el.id);
			}}
		>
			{#each field.options ?? [] as opt (opt)}
				<option value={opt} selected={field.value === opt}>{opt}</option>
			{/each}
		</select>
	{:else if field.field === 'signature'}
		<label
			class="flex h-full w-full cursor-pointer items-center justify-center rounded border border-dashed border-gray-400 bg-white/80 text-xs text-gray-500"
		>
			{#if field.value}
				<img
					src={field.value}
					alt="Signature"
					class="pointer-events-none h-full w-full object-contain"
				/>
			{:else}
				Signature
			{/if}
			<input type="file" accept="image/png,.png" class="hidden" onchange={readSig} />
		</label>
	{/if}

	{#if selected}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-blue-500"
			onpointerdown={(e) => editor.startResize(e, field)}
		></span>
	{/if}
</div>
