<script lang="ts">
	import { resolve } from '$app/paths';
	import Seo from '$lib/components/Seo.svelte';
	import type { PageData } from './$types';

	// Layout data (user/isRoot) flows into page data.
	let { data }: { data: PageData } = $props();

	let annual = $state(true);

	const proMonthly = 6;
	const proAnnual = 48; // $4/mo billed yearly
	const dayPass = 3;

	const proPrice = $derived(annual ? proAnnual / 12 : proMonthly);
	const proSuffix = $derived(annual ? '/mo billed yearly' : '/mo');

	let upgrading = $state(false);

	async function startCheckout() {
		if (upgrading) return;
		upgrading = true;
		try {
			const res = await fetch('/api/billing/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cadence: annual ? 'annual' : 'monthly' })
			});
			if (!res.ok) throw new Error(`Checkout failed (${res.status})`);
			const { url } = (await res.json()) as { url: string };
			window.location.href = url;
		} catch (e) {
			upgrading = false;
			alert('Could not start checkout. Please try again.');
			console.error(e);
		}
	}
</script>

<Seo
	title="Pricing — Better PDF Web"
	description="Free PDF editing in your browser with no account. Go Pro for $6/mo ($48/year) for unlimited exports and priority processing, or grab a $3 day pass."
/>

<main class="mx-auto max-w-5xl px-6 py-16">
	<div class="mb-10 text-center">
		<h1 class="text-3xl font-bold text-gray-900">Simple pricing</h1>
		<p class="mt-2 text-gray-600">Edit, fill, sign and export PDFs in your browser.</p>

		<!-- Monthly / annual toggle -->
		<div class="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 p-1 text-sm">
			<button
				class="rounded px-3 py-1.5 font-medium {!annual
					? 'bg-gray-900 text-white'
					: 'text-gray-600 hover:bg-gray-100'}"
				onclick={() => (annual = false)}
			>
				Monthly
			</button>
			<button
				class="rounded px-3 py-1.5 font-medium {annual
					? 'bg-gray-900 text-white'
					: 'text-gray-600 hover:bg-gray-100'}"
				onclick={() => (annual = true)}
			>
				Annual <span class="text-green-600">−33%</span>
			</button>
		</div>
	</div>

	<div class="grid gap-6 md:grid-cols-3">
		<!-- Free -->
		<div class="flex flex-col rounded-xl border border-gray-200 p-6">
			<h2 class="text-lg font-semibold text-gray-900">Free</h2>
			<p class="mt-2 text-3xl font-bold text-gray-900">$0</p>
			<p class="text-sm text-gray-500">No account needed</p>
			<ul class="mt-4 flex-1 space-y-2 text-sm text-gray-600">
				<li>✓ All editing tools</li>
				<li>✓ Fill &amp; sign forms</li>
				<li>✓ 2 exports/hour (5 when signed in)</li>
			</ul>
			<a
				href={resolve('/editor')}
				class="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-800 hover:bg-gray-50"
			>
				Open editor
			</a>
		</div>

		<!-- Pro -->
		<div class="flex flex-col rounded-xl border-2 border-blue-600 p-6 shadow-sm">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-900">Pro</h2>
				<span class="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
					>Popular</span
				>
			</div>
			<p class="mt-2 text-3xl font-bold text-gray-900">
				${proPrice}<span class="text-base font-normal text-gray-500">{proSuffix}</span>
			</p>
			<p class="text-sm text-gray-500">
				{annual ? `$${proAnnual}/year` : `or $${proAnnual}/year (save 33%)`}
			</p>
			<ul class="mt-4 flex-1 space-y-2 text-sm text-gray-600">
				<li>✓ Everything in Free</li>
				<li>✓ Unlimited exports</li>
				<li>✓ Priority processing</li>
				<li>✓ Heavy ops (OCR / compress) as they ship</li>
			</ul>
			{#if data.plan === 'pro' || data.plan === 'root'}
				<div
					class="mt-6 flex items-center justify-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-center text-sm font-semibold text-blue-700"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M5 12l5 5L20 7"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Your current plan
				</div>
			{:else if data.user}
				<button
					type="button"
					onclick={startCheckout}
					disabled={upgrading}
					class="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
				>
					{upgrading ? 'Starting checkout…' : 'Upgrade to Pro'}
				</button>
			{:else}
				<a
					href={resolve('/signup')}
					class="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
				>
					Get started
				</a>
			{/if}
		</div>

		<!-- Day pass -->
		<div class="flex flex-col rounded-xl border border-gray-200 p-6">
			<h2 class="text-lg font-semibold text-gray-900">Day pass</h2>
			<p class="mt-2 text-3xl font-bold text-gray-900">
				${dayPass}<span class="text-base font-normal text-gray-500">/24h</span>
			</p>
			<p class="text-sm text-gray-500">One-off, no subscription</p>
			<ul class="mt-4 flex-1 space-y-2 text-sm text-gray-600">
				<li>✓ Unlimited exports for 24 hours</li>
				<li>✓ Great for a one-time job</li>
			</ul>
			<button
				type="button"
				disabled
				class="mt-6 cursor-not-allowed rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-500 opacity-60"
			>
				Coming soon
			</button>
		</div>
	</div>

	{#if data.manageUrl}
		<p class="mt-8 text-center text-sm">
			<!-- external Lemon Squeezy billing portal URL; resolve() applies only to internal routes -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={data.manageUrl} class="font-medium text-blue-600 hover:underline">
				Manage billing
			</a>
		</p>
	{/if}
	<p class="mt-2 text-center text-xs text-gray-400">
		Prices in USD. Billing is handled securely by Lemon Squeezy.
	</p>
</main>
