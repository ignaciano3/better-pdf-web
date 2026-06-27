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

	// Vector shapes drawn directly on the page.
	const shapeTools: { kind: DrawKind; label: string }[] = [
		{ kind: 'line', label: 'Line' },
		{ kind: 'rectangle', label: 'Rectangle' },
		{ kind: 'ellipse', label: 'Ellipse' },
		{ kind: 'polygon', label: 'Polygon' },
		{ kind: 'path', label: 'Draw' }
	];

	/** Activate a draw tool, or toggle back to select if it's already active. */
	function toggleDraw(kind: DrawKind) {
		if (editor.activeDrawKind === kind) editor.resetTool();
		else editor.setTool({ type: 'draw', kind });
	}
</script>

<div class="flex min-w-0 items-center gap-1.5">
	<span class={sectionLabel}>Shapes</span>
	<div class={sectionGroup}>
		{#each shapeTools as t (t.kind)}
			<button
				class={toolClass(editor.activeDrawKind === t.kind)}
				aria-pressed={editor.activeDrawKind === t.kind}
				title={tip(t.label, t.kind)}
				onclick={() => toggleDraw(t.kind)}
			>
				{t.label}
			</button>
		{/each}
	</div>
</div>
