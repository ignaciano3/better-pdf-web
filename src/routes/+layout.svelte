<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Header from '$lib/components/Header.svelte';

	let { children, data } = $props();

	// The editor manages its own full-height, full-bleed layout; every other route
	// gets the standard padded, scrollable main.
	const isEditor = $derived(page.url.pathname.startsWith('/editor'));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<div class="flex h-screen flex-col">
	<div class="shrink-0">
		<Header user={data.user} isRoot={data.isRoot} />
	</div>
	{#if isEditor}
		<div class="flex min-h-0 flex-1 flex-col">
			{@render children()}
		</div>
	{:else}
		<main class="flex-1 overflow-auto px-6 py-6">
			{@render children()}
		</main>
	{/if}
</div>
