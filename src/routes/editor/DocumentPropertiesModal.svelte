<script lang="ts">
	import type { EditorState } from './editor.svelte';

	let { editor }: { editor: EditorState } = $props();

	const open = $derived(editor.docPropsModalOpen);

	// Keywords are edited as a comma-separated string for simplicity.
	let keywordsDraft = $state('');
	let lastOpen = $state(false);

	$effect(() => {
		// Sync the draft from state each time the modal opens.
		if (open && !lastOpen) {
			keywordsDraft = (editor.metadata.keywords ?? []).join(', ');
		}
		lastOpen = open;
	});

	function field(key: 'title' | 'author' | 'subject' | 'creator' | 'producer'): string {
		return editor.metadata[key] ?? '';
	}
	function setField(
		key: 'title' | 'author' | 'subject' | 'creator' | 'producer',
		value: string
	): void {
		editor.metadata = { ...editor.metadata, [key]: value };
	}

	function save() {
		const keywords = keywordsDraft
			.split(',')
			.map((k) => k.trim())
			.filter((k) => k.length > 0);
		editor.metadata = { ...editor.metadata, keywords };
		editor.docPropsModalOpen = false;
	}

	function cancel() {
		editor.docPropsModalOpen = false;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) cancel();
		}}
	>
		<div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
			<h2 class="mb-4 text-base font-semibold text-slate-900">Document properties</h2>

			<div class="flex flex-col gap-3">
				{#each [['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['creator', 'Creator'], ['producer', 'Producer']] as const as [key, label] (key)}
					<label class="flex flex-col gap-1">
						<span class="text-xs font-medium text-slate-600">{label}</span>
						<input
							type="text"
							class="rounded border border-slate-300 px-2 py-1.5 text-sm"
							value={field(key)}
							oninput={(e) => setField(key, (e.currentTarget as HTMLInputElement).value)}
						/>
					</label>
				{/each}
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium text-slate-600">Keywords (comma-separated)</span>
					<input
						type="text"
						class="rounded border border-slate-300 px-2 py-1.5 text-sm"
						bind:value={keywordsDraft}
					/>
				</label>
				<label class="mt-1 flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={editor.flatten} />
					<span class="text-slate-700">Flatten fields on export (print-ready, non-editable)</span>
				</label>
				<label class="mt-1 flex items-start gap-2 text-sm" class:opacity-50={editor.flatten}>
					<input
						type="checkbox"
						class="mt-0.5"
						disabled={editor.flatten}
						bind:checked={editor.optimizeSize}
					/>
					<span class="text-slate-700">
						Compact PDF structure (rebuilds file, PDF 1.5+)
						<span class="mt-0.5 block text-xs text-slate-500">
							{#if editor.flatten}
								Unavailable while flattening — flattened files can't use this optimization.
							{:else}
								Rebuilds the document with its internal objects packed into compressed streams — a
								marginally smaller file. The original PDF's interactive form fields are removed, and
								a PDF 1.5+ reader is required (not suitable for PDF/A archival). Leave off to
								preserve the original document.
							{/if}
						</span>
					</span>
				</label>
			</div>

			<div class="mt-5 flex justify-end gap-2">
				<button
					type="button"
					class="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
					onclick={cancel}
				>
					Cancel
				</button>
				<button
					type="button"
					class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					onclick={save}
				>
					Save
				</button>
			</div>
		</div>
	</div>
{/if}
