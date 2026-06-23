<script lang="ts">
	import { resolve } from '$app/paths';
	import type { EditorState } from './editor.svelte';

	let { editor, signedIn }: { editor: EditorState; signedIn: boolean } = $props();

	const info = $derived(editor.upsell);
	const minutes = $derived(info?.window ? Math.round(info.window / 60000) : 60);
</script>

{#if info}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) editor.dismissUpsell();
		}}
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h2 class="text-lg font-semibold text-gray-900">Export limit reached</h2>
			<p class="mt-2 text-sm text-gray-600">
				You've used your {info.limit ?? ''} free export{info.limit === 1 ? '' : 's'} for the last
				{minutes} minutes. Your edits are still here — try again later, or get more now.
			</p>
			<div class="mt-5 flex flex-col gap-2">
				{#if signedIn}
					<a
						href={resolve('/pricing')}
						class="rounded bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
					>
						Upgrade for unlimited exports
					</a>
				{:else}
					<a
						href={resolve('/signup')}
						class="rounded bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
					>
						Sign up for a higher limit
					</a>
				{/if}
				<button
					onclick={() => editor.dismissUpsell()}
					class="rounded px-3 py-2 text-center text-sm text-gray-600 hover:bg-gray-100"
				>
					Keep editing
				</button>
			</div>
		</div>
	</div>
{/if}
