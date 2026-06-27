<script lang="ts">
	import type { CheckStyle, EditElement, FieldElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState; preview?: boolean } = $props();
	const field = $derived(el as FieldElement);
	const selected = $derived(editor.selectedId === el.id);

	const w = $derived(Math.max(field.width, 0) * SCALE);
	const h = $derived(Math.max(field.height, 0) * SCALE);

	// Reflect the field's authored border/background so the editor preview matches
	// the exported widget (#1). Inline styles override the default gray affordance.
	function rgbCss(c: { r: number; g: number; b: number }): string {
		const n = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
		return `rgb(${n(c.r)} ${n(c.g)} ${n(c.b)})`;
	}
	const fieldStyle = $derived.by(() => {
		let s = '';
		if (field.border)
			s += `border:${field.border.width ?? 1}px solid ${rgbCss(field.border.color)};`;
		if (field.background) s += `background-color:${rgbCss(field.background)};`;
		if (field.textColor) s += `color:${rgbCss(field.textColor)};`;
		// Align + font size apply to fields that render value text. fontSize is in
		// PDF points; scale to canvas px like the rest of the overlay geometry.
		if (field.align) s += `text-align:${field.align};`;
		if (field.fontSize !== undefined) s += `font-size:${field.fontSize * SCALE}px;`;
		return s;
	});

	// Preview the lib's checkStyle mark shape (drawn when the box/radio is on).
	// Native inputs can't render these, so we show the matching glyph ourselves.
	const CHECK_GLYPH: Record<CheckStyle, string> = {
		check: '✓',
		cross: '✗',
		circle: '●',
		square: '■',
		diamond: '◆',
		star: '★'
	};
	const checkGlyph = $derived(CHECK_GLYPH[field.checkStyle ?? 'check']);
	const radioGlyph = $derived(CHECK_GLYPH[field.checkStyle ?? 'circle']);

	// Radio buttons: each option is an independently placed widget (#3). Position
	// from radioLayout, falling back to a vertical stack below the anchor.
	const radioSize = $derived(Math.min(field.width, field.height));
	const radioPositions = $derived(
		(field.options ?? []).map(
			(_, i) => field.radioLayout?.[i] ?? { x: field.x, y: field.y + i * (radioSize + 6) }
		)
	);

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

{#if field.field === 'radio'}
	<!-- Radio: one independently draggable widget per option (#3). Each button is
	     placed at its own page position; drag the circle to move just that one. -->
	{#each field.options ?? [] as opt, i (i)}
		{@const p = radioPositions[i] ?? { x: field.x, y: field.y }}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute flex touch-none cursor-move items-center {selected
				? 'ring-2 ring-blue-400'
				: 'ring-1 ring-blue-300/60'}"
			style="left: {p.x * SCALE}px; top: {p.y * SCALE}px; height: {radioSize * SCALE}px;"
			title="{field.tooltip ?? field.name}: {opt}"
			onpointerdown={(e) => editor.startRadioDrag(e, field, i)}
		>
			<span
				class="flex items-center justify-center rounded-full border border-slate-400 leading-none"
				style="width: {radioSize * SCALE}px; height: {radioSize * SCALE}px; {fieldStyle ||
					'background:rgba(255,255,255,0.9);'} border-radius:9999px; font-size: {radioSize *
					SCALE *
					0.7}px;"
			>
				{field.value === opt ? radioGlyph : ''}
			</span>
			{#if selected}
				<span
					class="pointer-events-none ml-1 text-xs whitespace-nowrap text-slate-500 italic">{opt}</span>
			{/if}
		</div>
	{/each}
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="absolute {selected ? 'ring-2 ring-blue-400' : 'ring-1 ring-blue-300/60'}"
		style="left: {field.x * SCALE}px; top: {field.y * SCALE}px; width: {w}px; height: {h}px;"
		title={field.tooltip ?? field.name}
	>
		<!-- Drag chrome strip across the top so the inner control stays usable. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="absolute -top-3 left-0 h-3 w-full touch-none cursor-move bg-blue-300/70"
			onpointerdown={onChromeDown}
		></span>

		{#if field.field === 'text'}
			{#if field.multiline}
				<textarea
					class="h-full w-full resize-none rounded border border-slate-300 bg-white/90 px-1 text-xs"
					style={fieldStyle}
					placeholder={field.placeholder ?? ''}
					maxlength={field.maxLength}
					readonly={field.readOnly}
					bind:value={field.value}
					onfocus={() => editor.select(el.id)}></textarea>
			{:else}
				<input
					type="text"
					class="h-full w-full rounded border border-slate-300 bg-white/90 px-1 text-xs"
					style={fieldStyle}
					placeholder={field.placeholder ?? ''}
					maxlength={field.maxLength}
					readonly={field.readOnly}
					bind:value={field.value}
					onfocus={() => editor.select(el.id)}
				/>
			{/if}
		{:else if field.field === 'checkbox'}
			<!-- Custom cell so the checkStyle mark shape is visible (native checkboxes
			     always draw a tick). Glyph sized to ~80% of the box height. -->
			<button
				type="button"
				class="flex h-full w-full items-center justify-center border border-slate-300 bg-white/90 leading-none {field.readOnly
					? 'cursor-default'
					: 'cursor-pointer'}"
				style="{fieldStyle} font-size: {h * 0.8}px;"
				disabled={field.readOnly}
				aria-pressed={!!field.value}
				onclick={() => {
					field.value = field.value ? '' : 'Yes';
					editor.select(el.id);
				}}
			>
				{field.value ? checkGlyph : ''}
			</button>
		{:else if field.field === 'dropdown' || field.field === 'combo'}
			<select
				class="h-full w-full rounded border border-slate-300 bg-white/90 px-1 text-xs"
				style={fieldStyle}
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
				class="h-full w-full rounded border border-slate-300 bg-white/90 px-1 text-xs"
				style={fieldStyle}
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
				class="flex h-full w-full cursor-pointer items-center justify-center rounded border border-dashed border-slate-400 bg-white/80 text-xs text-slate-500"
				style={fieldStyle}
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
				class="absolute -right-1.5 -bottom-1.5 h-3 w-3 touch-none cursor-nwse-resize rounded-sm border border-white bg-blue-500"
				onpointerdown={(e) => editor.startResize(e, field)}
			></span>
		{/if}
	</div>
{/if}
