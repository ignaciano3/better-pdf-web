<script lang="ts">
	import AccountSection from './AccountSection.svelte';
	import SubscriptionSection from './SubscriptionSection.svelte';
	import UsageSection from './UsageSection.svelte';
	import SecuritySection from './SecuritySection.svelte';

	let { data } = $props();
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
	<UsageSection used={data.usage.used} limit={data.usage.limit} resetAt={data.usage.resetAt} />
	<SecuritySection />
</div>
