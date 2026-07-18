<script lang="ts">
	import type { EditorState } from '../editor.svelte';
	import type { DrawKind } from '../constants';
	import { DRAW_SHORTCUTS } from '../constants';
	import { sectionLabel, sectionGroup, toolClass } from './styles';

	/** Tooltip text with the tool's single-key accelerator, when it has one. */
	function tip(label: string, kind: DrawKind): string {
		const key = DRAW_SHORTCUTS[kind];
		return key ? `${label} (${key.toUpperCase()})` : label;
	}

	let { editor }: { editor: EditorState } = $props();

	// Text-oriented markup drawn over a dragged region.
	const markupTools: { kind: DrawKind; label: string; hint?: string }[] = [
		{ kind: 'highlight', label: 'Highlight' },
		{ kind: 'underline', label: 'Underline' },
		{ kind: 'strikethrough', label: 'Strikethrough' },
		{
			kind: 'whiteout',
			label: 'Whiteout',
			// Honest copy: whiteout only covers, it never removes hidden data.
			hint: 'Whiteout covers content visually but does NOT remove the hidden text/image underneath — it is not redaction.'
		}
	];

	/** Tooltip: prefer the tool's hint copy, else label + accelerator. */
	function toolTitle(t: { kind: DrawKind; label: string; hint?: string }): string {
		return t.hint ?? tip(t.label, t.kind);
	}

	/** Activate a draw tool, or toggle back to select if it's already active. */
	function toggleDraw(kind: DrawKind) {
		if (editor.activeDrawKind === kind) editor.resetTool();
		else editor.setTool({ type: 'draw', kind });
	}
</script>

<div class="flex shrink-0 items-center gap-1.5 sm:min-w-0 sm:shrink lg:flex-auto">
	<span class={sectionLabel}>Markup</span>
	<div class={sectionGroup}>
		{#each markupTools as t (t.kind)}
			<button
				class={toolClass(editor.activeDrawKind === t.kind)}
				aria-pressed={editor.activeDrawKind === t.kind}
				title={toolTitle(t)}
				onclick={() => toggleDraw(t.kind)}
			>
				{t.label}
			</button>
		{/each}
	</div>
</div>
