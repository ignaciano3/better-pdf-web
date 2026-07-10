<script lang="ts">
	import './layout.css';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { authClient } from '$lib/auth-client';
	import Header from '$lib/components/Header.svelte';
	import { isToolPath } from '$lib/seo/tools';

	let { children, data } = $props();

	// The editor manages its own full-height, full-bleed layout; every other route
	// gets the standard padded, scrollable main.
	const isEditor = $derived(page.url.pathname.startsWith('/editor'));
	// The landing page and the SEO tool pages are full-bleed (their own section
	// padding); other routes get the padded main.
	const isHome = $derived(page.url.pathname === '/' || isToolPath(page.url.pathname));

	// The SEO tool pages are prerendered, so their layout data bakes in a
	// logged-out header (the layout load runs at build time with no cookies —
	// see [tool]/+page.ts). The session cookie is httpOnly and invisible to
	// JS, so when a tool page hydrates without a user we ask the auth server
	// once; only if a real session exists do we refetch layout data.
	let sessionRecoveryDone = false;
	$effect(() => {
		if (sessionRecoveryDone || data.user || !isToolPath(page.url.pathname)) return;
		sessionRecoveryDone = true;
		authClient.getSession().then(({ data: session }) => {
			if (session) invalidateAll();
		});
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{#if isEditor}
	<!-- The editor owns a locked, full-height shell; it manages its own internal scrolling. -->
	<div class="flex h-screen flex-col">
		<div class="shrink-0">
			<Header user={data.user} plan={data.plan} isRoot={data.isRoot} />
		</div>
		<div class="flex min-h-0 flex-1 flex-col">
			{@render children()}
		</div>
	</div>
{:else}
	<!-- Content routes use native document scroll with a sticky header. -->
	<div class="flex min-h-screen flex-col">
		<div class="sticky top-0 z-40 shrink-0">
			<Header user={data.user} plan={data.plan} isRoot={data.isRoot} />
		</div>
		{#if isHome}
			<main class="flex-1">
				{@render children()}
			</main>
		{:else}
			<main class="flex-1 px-6 py-6">
				{@render children()}
			</main>
		{/if}
	</div>
{/if}
