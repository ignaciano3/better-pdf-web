<script lang="ts">
	import type { EditElement, LinkElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState; preview?: boolean } = $props();
	const link = $derived(el as LinkElement);

	const w = $derived(Math.max(link.width, 0) * SCALE);
	const h = $derived(Math.max(link.height, 0) * SCALE);
	const hasTarget = $derived(
		typeof link.goToPage === 'number' || (typeof link.url === 'string' && link.url.length > 0)
	);
	const label = $derived(
		typeof link.goToPage === 'number'
			? `→ page ${link.goToPage + 1}`
			: link.url
				? link.url
				: '⚠ no target — won’t export'
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute cursor-move overflow-hidden rounded-sm border border-dashed {hasTarget
		? 'border-blue-500 bg-blue-400/15'
		: 'border-amber-500 bg-amber-400/20'} {editor.selectedId === el.id
		? 'ring-2 ring-blue-400'
		: ''}"
	style="left: {link.x * SCALE}px; top: {link.y * SCALE}px; width: {w}px; height: {h}px;"
	onpointerdown={(e) => editor.startDrag(e, link)}
	title={label}
>
	<span
		class="pointer-events-none absolute inset-0 truncate p-0.5 text-[10px] leading-tight {hasTarget
			? 'text-blue-700'
			: 'text-amber-700'}"
	>
		{label}
	</span>
	{#if editor.selectedId === el.id}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span
			class="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-blue-500"
			onpointerdown={(e) => editor.startResize(e, link)}
		></span>
	{/if}
</div>
