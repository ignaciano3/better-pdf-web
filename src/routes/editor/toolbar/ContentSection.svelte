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

	let { editor, onDrawSignature }: { editor: EditorState; onDrawSignature: () => void } = $props();

	/** Activate a draw tool, or toggle back to select if it's already active. */
	function toggleDraw(kind: DrawKind) {
		if (editor.activeDrawKind === kind) editor.resetTool();
		else editor.setTool({ type: 'draw', kind });
	}

	async function onImageUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const pending = await editor.readRaster(file);
			if (pending) {
				editor.pendingImage = pending;
				editor.setTool({ type: 'draw', kind: 'image' });
			}
		}
		input.value = '';
	}
</script>

<div class="flex shrink-0 items-center gap-1.5 sm:min-w-0 sm:shrink lg:flex-auto">
	<span class={sectionLabel}>Content</span>
	<div class={sectionGroup}>
		<button
			class={toolClass(editor.activeDrawKind === 'text')}
			aria-pressed={editor.activeDrawKind === 'text'}
			title={tip('Text', 'text')}
			onclick={() => toggleDraw('text')}
		>
			Text
		</button>
		<label class={toolClass(editor.activeDrawKind === 'image') + ' cursor-pointer'} title="Image">
			Image
			<input
				type="file"
				accept="image/png,image/jpeg,.png,.jpg,.jpeg"
				class="hidden"
				onchange={onImageUpload}
			/>
		</label>
		<button
			class={toolClass(editor.activeDrawKind === 'signature')}
			aria-pressed={editor.activeDrawKind === 'signature'}
			title={tip('Signature', 'signature')}
			onclick={onDrawSignature}
		>
			Signature
		</button>
		<button
			class={toolClass(editor.activeDrawKind === 'link')}
			aria-pressed={editor.activeDrawKind === 'link'}
			title={tip('Link', 'link')}
			onclick={() => toggleDraw('link')}
		>
			Link
		</button>
	</div>
</div>
