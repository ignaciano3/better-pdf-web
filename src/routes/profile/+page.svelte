<script lang="ts">
	import AccountSection from './AccountSection.svelte';
	import SubscriptionSection from './SubscriptionSection.svelte';
	import UsageSection from './UsageSection.svelte';
	import SecuritySection from './SecuritySection.svelte';
	import { getProfileUsage } from './usage.remote';

	let { data } = $props();

	// SSR renders the own-only count; refine to the combined own+anonymous count
	// (what the export gate enforces) once the browser fingerprint is available.
	// One-time capture is intentional — a later invalidateAll (e.g. after a name
	// change) must not clobber the refined figure.
	// svelte-ignore state_referenced_locally
	let usage = $state(data.usage);

	$effect(() => {
		// Read-only: never mint a fingerprint here (a fresh id matches no events);
		// an absent key means this browser has no anonymous exports, so own-only
		// is already correct.
		const fingerprint = localStorage.getItem('bpw:fingerprint');
		if (!fingerprint) return;
		getProfileUsage({ fingerprint })
			.then((refined) => {
				usage = refined;
			})
			.catch(() => {
				// Usage display is non-critical; keep the SSR own-only value on failure.
			});
	});
</script>

<svelte:head><title>Your profile — Better PDF Web</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-2xl font-semibold text-slate-900">Your profile</h1>
	<AccountSection
		name={data.name}
		email={data.email}
		emailVerified={data.emailVerified}
		hasPassword={data.hasPassword}
	/>
	<SubscriptionSection
		plan={data.plan}
		status={data.subscription.status}
		currentPeriodEnd={data.subscription.currentPeriodEnd}
		manageUrl={data.subscription.manageUrl}
	/>
	<UsageSection used={usage.used} limit={usage.limit} resetAt={usage.resetAt} />
	<SecuritySection />
</div>
