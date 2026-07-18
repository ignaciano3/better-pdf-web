<script lang="ts">
	let { used, limit, resetAt }: { used: number; limit: number | null; resetAt: string | null } =
		$props();

	const resetLabel = $derived(
		resetAt
			? new Date(resetAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
			: null
	);
</script>

<section class="rounded-xl border border-slate-200 bg-white p-6">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Usage</h2>
	{#if limit === null}
		<p class="text-slate-900"><span class="font-semibold">Unlimited</span> exports.</p>
	{:else}
		<p class="text-slate-900">
			<span class="font-semibold">{used} / {limit}</span> exports used this hour.
		</p>
		{#if resetLabel && used >= limit}
			<p class="mt-1 text-sm text-slate-500">Resets around {resetLabel}.</p>
		{/if}
	{/if}
</section>
