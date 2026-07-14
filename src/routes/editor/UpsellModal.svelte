<script lang="ts">
	import { resolve } from '$app/paths';
	import type { EditorState } from './editor.svelte';

	let { editor, signedIn }: { editor: EditorState; signedIn: boolean } = $props();

	const info = $derived(editor.upsell);
	const minutes = $derived(info?.window ? Math.round(info.window / 60000) : 60);

	// When the gate tells us the reset instant, turn it into "in ~N minutes" plus a
	// wall-clock time so the user knows exactly when they can export again.
	function untilLabel(ts: number): string {
		const ms = ts - Date.now();
		if (ms <= 30_000) return 'in less than a minute';
		const mins = Math.round(ms / 60000);
		if (mins < 60) return `in about ${mins} minute${mins === 1 ? '' : 's'}`;
		const hrs = Math.round(mins / 60);
		return `in about ${hrs} hour${hrs === 1 ? '' : 's'}`;
	}
	function clockLabel(ts: number): string {
		return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}
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
			<h2 class="text-lg font-semibold text-slate-900">Export limit reached</h2>
			<p class="mt-2 text-sm text-slate-600">
				{#if info.retryAt}
					You've used your {info.limit ?? ''} free export{info.limit === 1 ? '' : 's'} for the last
					{minutes} minutes. Your edits are still here — you can export again {untilLabel(
						info.retryAt
					)} (around {clockLabel(info.retryAt)}), or get more now.
				{:else}
					You've used your {info.limit ?? ''} free export{info.limit === 1 ? '' : 's'} for the last
					{minutes} minutes. Your edits are still here — try again later, or get more now.
				{/if}
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
					class="rounded px-3 py-2 text-center text-sm text-slate-600 hover:bg-slate-100"
				>
					Keep editing
				</button>
			</div>
		</div>
	</div>
{/if}
