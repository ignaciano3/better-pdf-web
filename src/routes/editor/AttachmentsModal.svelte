<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { AfRelationship } from '$lib/pdf/types';

	let { editor }: { editor: EditorState } = $props();

	const open = $derived(editor.attachmentsModalOpen);
	const sourceNames = $derived(new Set(editor.sourceAttachmentNames));

	const REL: AfRelationship[] = [
		'Unspecified',
		'Source',
		'Data',
		'Alternative',
		'Supplement',
		'EncryptedPayload',
		'FormData',
		'Schema'
	];

	function fmtSize(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	}

	async function onPick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		for (const f of files) await editor.addAttachment(f);
		input.value = '';
	}

	function setField(id: string, key: 'description' | 'afRelationship', value: string) {
		editor.attachments = editor.attachments.map((a) =>
			a.id === id ? { ...a, [key]: value || undefined } : a
		);
	}

	function close() {
		editor.attachmentsModalOpen = false;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div class="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
			<h2 class="mb-1 text-base font-semibold text-slate-900">Attachments</h2>
			<p class="mb-4 text-xs text-slate-500">
				Files embedded in the exported PDF (e.g. an XML invoice sidecar).
			</p>

			{#if editor.attachments.length === 0}
				<p
					class="rounded border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400"
				>
					No attachments yet.
				</p>
			{:else}
				<ul class="flex flex-col gap-3">
					{#each editor.attachments as a (a.id)}
						<li class="rounded border border-slate-200 p-3">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-slate-800">{a.name}</p>
									<p class="text-xs text-slate-500">
										{fmtSize(a.bytes.byteLength)}{a.mimeType ? ` · ${a.mimeType}` : ''}
										{#if sourceNames.has(a.name)}
											<span
												class="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500"
											>
												in source
											</span>
										{/if}
									</p>
								</div>
								<button
									type="button"
									class="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
									aria-label={`Remove ${a.name}`}
									onclick={() => editor.removeAttachment(a.id)}
								>
									Remove
								</button>
							</div>
							<div class="mt-2 flex gap-2">
								<input
									type="text"
									class="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
									placeholder="Description (optional)"
									value={a.description ?? ''}
									oninput={(e) =>
										setField(a.id, 'description', (e.currentTarget as HTMLInputElement).value)}
								/>
								<select
									class="rounded border border-slate-300 px-2 py-1 text-xs"
									value={a.afRelationship ?? 'Unspecified'}
									onchange={(e) =>
										setField(a.id, 'afRelationship', (e.currentTarget as HTMLSelectElement).value)}
								>
									{#each REL as r (r)}<option value={r}>{r}</option>{/each}
								</select>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="mt-4 flex items-center justify-between">
				<label
					class="cursor-pointer rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
				>
					Add file…
					<input type="file" multiple class="hidden" onchange={onPick} />
				</label>
				<button
					type="button"
					class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					onclick={close}
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}
