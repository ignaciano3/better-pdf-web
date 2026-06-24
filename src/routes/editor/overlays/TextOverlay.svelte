<script lang="ts">
	import type { EditElement, TextElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState } = $props();
	const text = $derived(el as TextElement);

	function fontCss(font: string | undefined): string {
		if (!font) return 'Helvetica, Arial, sans-serif';
		if (font.startsWith('Times')) return '"Times New Roman", Times, serif';
		if (font.startsWith('Courier')) return '"Courier New", Courier, monospace';
		return 'Helvetica, Arial, sans-serif';
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute cursor-move whitespace-pre outline-none {editor.selectedId === el.id
		? 'ring-2 ring-blue-400'
		: ''}"
	style="left: {text.x * SCALE}px; top: {text.y * SCALE}px; font-size: {text.size *
		SCALE}px; line-height: {text.lineHeight
		? text.lineHeight / text.size
		: 1}; font-family: {fontCss(text.font)}; color: {text.color
		? `rgb(${text.color.r * 255} ${text.color.g * 255} ${text.color.b * 255})`
		: 'black'}; opacity: {text.opacity ?? 1}; transform: rotate({text.rotation ??
		0}deg); transform-origin: top left;"
	contenteditable="plaintext-only"
	onpointerdown={(e) => editor.startDrag(e, text)}
	oninput={(e) => (text.text = (e.currentTarget as HTMLElement).innerText)}
>
	{text.text}
</div>
