<script lang="ts">
	import type { EditorState } from '../editor.svelte';
	import type { FieldKind } from '../constants';
	import { sectionLabel, sectionGroup, toolClass } from './styles';

	let { editor }: { editor: EditorState } = $props();

	const fieldTools: { kind: FieldKind; label: string }[] = [
		{ kind: 'text', label: 'Text field' },
		{ kind: 'checkbox', label: 'Checkbox' },
		{ kind: 'radio', label: 'Radio group' },
		{ kind: 'dropdown', label: 'Dropdown' },
		{ kind: 'combo', label: 'Combo box' },
		{ kind: 'listbox', label: 'List box' },
		{ kind: 'signature', label: 'Signature field' }
	];

	/** Activate a field tool, or toggle back to select if it's already active. */
	function toggleField(kind: FieldKind) {
		if (editor.activeFieldKind === kind) editor.resetTool();
		else editor.setTool({ type: 'field', kind });
	}
</script>

<div class="flex shrink-0 items-center gap-1.5 sm:min-w-0 sm:shrink lg:flex-auto">
	<span class={sectionLabel}>Fields</span>
	<div class={sectionGroup}>
		{#each fieldTools as f (f.kind)}
			<button
				class={toolClass(editor.activeFieldKind === f.kind)}
				aria-pressed={editor.activeFieldKind === f.kind}
				onclick={() => toggleField(f.kind)}
			>
				{f.label}
			</button>
		{/each}
	</div>
</div>
