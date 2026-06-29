<script lang="ts">
	import type { Watermark } from '$lib/pdf/types';
	import { SCALE } from '../constants';

	// `pageWidth`/`pageHeight` are unzoomed canvas px (already × SCALE by caller).
	let {
		watermark,
		pageWidth,
		pageHeight
	}: {
		watermark: Watermark;
		pageWidth: number;
		pageHeight: number;
	} = $props();

	const text = $derived(watermark.text.trim());
	const sizePx = $derived((watermark.size ?? 48) * SCALE);
	const opacity = $derived(watermark.opacity ?? 0.3);
	const rotation = $derived(watermark.rotation ?? 45);

	// Object URL for an image watermark, revoked when the bytes change/unmount.
	let imageUrl = $state<string | null>(null);
	$effect(() => {
		if (!watermark.image || watermark.image.byteLength === 0) {
			imageUrl = null;
			return;
		}
		// Copy into a fresh ArrayBuffer so the Blob part type is satisfied (the
		// wire value may be backed by a non-ArrayBuffer buffer).
		const buf = new ArrayBuffer(watermark.image.byteLength);
		new Uint8Array(buf).set(watermark.image);
		const blob = new Blob([buf], {
			type: watermark.format === 'jpg' ? 'image/jpeg' : 'image/png'
		});
		const url = URL.createObjectURL(blob);
		imageUrl = url;
		return () => URL.revokeObjectURL(url);
	});
	const imgWidthPx = $derived((watermark.imageWidth ?? 240) * SCALE);
	const imgHeightPx = $derived((watermark.imageHeight ?? 240) * SCALE);

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

{#if imageUrl}
	<img
		src={imageUrl}
		alt="Watermark"
		class="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
		style="width: {imgWidthPx}px; height: {imgHeightPx}px; opacity: {opacity};
			transform: translate(-50%, -50%) rotate({rotation}deg);"
		draggable="false"
	/>
{:else if text.length > 0}
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
