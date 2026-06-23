<script lang="ts">
	import type { EditElement, TextElement } from '$lib/pdf/types';
	import type { EditorState } from '../editor.svelte';
	import { SCALE } from '../constants';

	let { el, editor }: { el: EditElement; editor: EditorState } = $props();
	const text = $derived(el as TextElement);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="absolute cursor-move whitespace-pre outline-none {editor.selectedId === el.id
		? 'ring-2 ring-blue-400'
		: ''}"
	style="left: {text.x * SCALE}px; top: {text.y * SCALE}px; font-size: {text.size *
		SCALE}px; line-height: 1; font-family: Helvetica, Arial, sans-serif;"
	contenteditable="plaintext-only"
	onpointerdown={(e) => editor.startDrag(e, text)}
	oninput={(e) => (text.text = (e.currentTarget as HTMLElement).innerText)}
>
	{text.text}
</div>
