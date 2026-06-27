<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';

	let { children, data } = $props();

	// The editor manages its own full-height, full-bleed layout; every other route
	// gets the standard padded, scrollable main.
	const isEditor = $derived(page.url.pathname.startsWith('/editor'));
	// The landing page is full-bleed (its own section padding); other routes get padded main.
	const isHome = $derived(page.url.pathname === '/');
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{#if isEditor}
	<!-- The editor owns a locked, full-height shell; it manages its own internal scrolling. -->
	<div class="flex h-screen flex-col">
		<div class="shrink-0">
			<Header user={data.user} isRoot={data.isRoot} />
		</div>
		<div class="flex min-h-0 flex-1 flex-col">
			{@render children()}
		</div>
	</div>
{:else}
	<!-- Content routes use native document scroll with a sticky header. -->
	<div class="flex min-h-screen flex-col">
		<div class="sticky top-0 z-40 shrink-0">
			<Header user={data.user} isRoot={data.isRoot} />
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
