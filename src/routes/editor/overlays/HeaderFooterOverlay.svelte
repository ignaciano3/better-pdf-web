<script lang="ts">
	import type { HeaderFooter, HFSection, HFPos } from '$lib/pdf/types';
	import { SCALE } from '../constants';
	import { fontFamily, fontWeight, fontStyle } from '../font-css';

	// A live preview of the running header/footer for one page, mirroring the
	// export logic in build.ts (drawHeaderFooter): per-section font/size/colour/
	// margin, {n}/{total}/{title} tokens, and startAt/skipFirst numbering.
	// `pageWidth`/`pageHeight` are unzoomed canvas px (already × SCALE by caller).
	let {
		hf,
		pageIndex,
		pageCount,
		title
	}: {
		hf: HeaderFooter;
		pageIndex: number;
		pageCount: number;
		title: string;
	} = $props();

	const skipFirst = $derived(hf.skipFirst ?? false);
	const startAt = $derived(hf.startAt ?? 1);
	// Total numbered pages and this page's number, matching build.ts exactly.
	const total = $derived(pageCount - (skipFirst ? 1 : 0));
	const skip = $derived(skipFirst && pageIndex === 0);
	const pageNo = $derived(startAt + (pageIndex - (skipFirst ? 1 : 0)));

	function subst(tmpl: string): string {
		return tmpl
			.replaceAll('{n}', String(pageNo))
			.replaceAll('{total}', String(total))
			.replaceAll('{title}', title);
	}

	function rgbCss(c: { r: number; g: number; b: number } | undefined): string {
		const v = c ?? { r: 0, g: 0, b: 0 };
		const n = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
		return `rgb(${n(v.r)} ${n(v.g)} ${n(v.b)})`;
	}

	// Positions in a fixed left→right order so alignment classes stay stable.
	const order: HFPos[] = ['left', 'center', 'right'];
	function slotsFor(section: HFSection): { pos: HFPos; text: string }[] {
		return order
			.map((pos) => ({ pos, text: section.slots[pos]?.trim() ? subst(section.slots[pos]!) : '' }))
			.filter((s) => s.text.length > 0);
	}

	const justify: Record<HFPos, string> = {
		left: 'flex-start',
		center: 'center',
		right: 'flex-end'
	};
</script>

{#if !skip}
	{#each [{ section: hf.header, edge: 'header' as const }, { section: hf.footer, edge: 'footer' as const }] as row (row.edge)}
		{#if row.section}
			{@const sec = row.section}
			{@const marginPx = (sec.margin ?? 36) * SCALE}
			{@const sizePx = (sec.size ?? 10) * SCALE}
			{#each slotsFor(sec) as slot (slot.pos)}
				<div
					class="pointer-events-none absolute flex select-none whitespace-nowrap"
					style="
						left: {marginPx}px; right: {marginPx}px;
						{row.edge === 'header' ? `top: ${marginPx}px;` : `bottom: ${marginPx}px;`}
						justify-content: {justify[slot.pos]};
						font-size: {sizePx}px; line-height: 1;
						color: {rgbCss(sec.color)};
						font-family: {fontFamily(sec.font)}; font-weight: {fontWeight(sec.font)};
						font-style: {fontStyle(sec.font)};"
				>
					{slot.text}
				</div>
			{/each}
		{/if}
	{/each}
{/if}
