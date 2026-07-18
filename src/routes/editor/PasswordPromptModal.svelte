<script lang="ts">
	import type { EditorState } from './editor.svelte';

	let { editor }: { editor: EditorState } = $props();

	const prompt = $derived(editor.passwordPrompt);
	let password = $state('');
	// Plain (non-reactive) so the effect neither tracks nor re-triggers on it.
	let lastPrompt: unknown = null;

	$effect(() => {
		// Clear the field each time a fresh prompt opens.
		if (prompt && prompt !== lastPrompt) password = '';
		lastPrompt = prompt;
	});

	function submit() {
		prompt?.resolve(password);
	}
	function cancel() {
		prompt?.reject();
	}
</script>

{#if prompt}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) cancel();
		}}
	>
		<div class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
			<h2 class="mb-1 text-base font-semibold text-slate-900">This PDF is password-protected</h2>
			<p class="mb-4 text-xs text-slate-500">
				Enter the password to open it. The file stays on your device.
			</p>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<label class="flex flex-col gap-1">
					<span class="text-xs font-medium text-slate-600">Password</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="password"
						autofocus
						class="rounded border border-slate-300 px-2 py-1.5 text-sm"
						class:border-red-400={prompt.wrongPassword}
						bind:value={password}
						onkeydown={(e) => {
							if (e.key === 'Escape') cancel();
						}}
					/>
				</label>
				{#if prompt.wrongPassword}
					<p class="mt-1 text-xs text-red-600">Incorrect password. Try again.</p>
				{/if}
				<div class="mt-5 flex justify-end gap-2">
					<button
						type="button"
						class="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
						onclick={cancel}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
					>
						Unlock
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
