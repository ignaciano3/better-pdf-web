<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		plan,
		status,
		currentPeriodEnd,
		manageUrl
	}: {
		plan: 'free' | 'pro' | 'root';
		status: string | null;
		currentPeriodEnd: string | null;
		manageUrl: string | null;
	} = $props();

	const renewLabel = $derived(
		currentPeriodEnd
			? new Date(currentPeriodEnd).toLocaleDateString(undefined, {
					year: 'numeric',
					month: 'long',
					day: 'numeric'
				})
			: null
	);
</script>

<section class="rounded-xl border border-slate-200 bg-white p-6">
	<div class="mb-4 flex items-center gap-3">
		<h2 class="text-lg font-semibold text-slate-900">Subscription</h2>
		<span
			class="rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase"
			class:bg-slate-100={plan === 'free'}
			class:text-slate-600={plan === 'free'}
			class:bg-blue-100={plan === 'pro'}
			class:text-blue-700={plan === 'pro'}
			class:bg-purple-100={plan === 'root'}
			class:text-purple-700={plan === 'root'}
		>
			{plan}
		</span>
	</div>

	{#if plan === 'free'}
		<p class="mb-4 text-sm text-slate-600">
			You're on the free plan (5 exports/hour). Upgrade for unlimited exports.
		</p>
		<a
			href={resolve('/pricing')}
			class="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
		>
			Upgrade to Pro
		</a>
	{:else if plan === 'pro'}
		<p class="mb-1 text-sm text-slate-600">Status: {status ?? 'active'}</p>
		{#if renewLabel}
			<p class="mb-4 text-sm text-slate-600">Renews {renewLabel}</p>
		{/if}
		{#if manageUrl}
			<a
				href={manageUrl}
				target="_blank"
				rel="noopener"
				class="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
			>
				Manage subscription
			</a>
		{/if}
	{:else}
		<p class="text-sm text-slate-600">
			You have a <strong>root</strong> plan — unlimited access, no billing.
		</p>
	{/if}
</section>
