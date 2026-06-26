<script lang="ts">
	import type { Watermark } from '$lib/pdf/types';
	import { SCALE } from '../constants';

	// `pageWidth`/`pageHeight` are unzoomed canvas px (already × SCALE by caller).
	let { watermark, pageWidth, pageHeight }: {
		watermark: Watermark; pageWidth: number; pageHeight: number;
	} = $props();

	const text = $derived(watermark.text.trim());
	const sizePx = $derived((watermark.size ?? 48) * SCALE);
	const opacity = $derived(watermark.opacity ?? 0.3);
	const rotation = $derived(watermark.rotation ?? 45);

	function rgbCss(c: { r: number; g: number; b: number } | undefined): string {
		const v = c ?? { r: 0.5, g: 0.5, b: 0.5 };
		const n = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
		return `rgb(${n(v.r)} ${n(v.g)} ${n(v.b)})`;
	}
	function fontFamily(f: string | undefined): string {
		if (f?.startsWith('Times')) return 'Georgia, "Times New Roman", serif';
		if (f?.startsWith('Courier')) return 'monospace';
		return 'Helvetica, Arial, sans-serif';
	}
	const weight = $derived(watermark.font?.includes('Bold') ? 700 : 400);
</script>

{#if text.length > 0}
	<div
		class="pointer-events-none absolute top-1/2 left-1/2 select-none whitespace-nowrap"
		style="transform: translate(-50%, -50%) rotate({rotation}deg);
			font-size: {sizePx}px; line-height: 1; opacity: {opacity};
			color: {rgbCss(watermark.color)}; font-family: {fontFamily(watermark.font)};
			font-weight: {weight}; width: {pageWidth}px; height: {pageHeight}px;
			display: flex; align-items: center; justify-content: center;"
	>
		{text}
	</div>
{/if}
