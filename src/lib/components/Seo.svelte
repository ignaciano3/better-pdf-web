<script lang="ts" module>
	export const SITE_NAME = 'Better PDF Web';
	// Default share image lives in /static; falls back to the request origin at render time.
	const DEFAULT_IMAGE = '/og.png';
</script>

<script lang="ts">
	import { page } from '$app/state';

	let {
		title,
		description,
		// Override the canonical/OG url; defaults to the current path (query stripped).
		canonical,
		// Absolute or root-relative path to the social share image.
		image = DEFAULT_IMAGE,
		type = 'website',
		// Keep app/auth routes out of the index.
		noindex = false,
		// One or more JSON-LD objects rendered as <script type="application/ld+json">.
		jsonLd
	}: {
		title: string;
		description: string;
		canonical?: string;
		image?: string;
		type?: 'website' | 'article';
		noindex?: boolean;
		jsonLd?: Record<string, unknown> | Record<string, unknown>[];
	} = $props();

	const origin = $derived(page.url.origin);
	const canonicalUrl = $derived(canonical ?? `${origin}${page.url.pathname}`);
	const imageUrl = $derived(image.startsWith('http') ? image : `${origin}${image}`);

	const blocks = $derived(jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []);
	// Escape "<" so a string value can never break out of the <script> tag.
	const serialize = (data: Record<string, unknown>) =>
		JSON.stringify(data).replace(/</g, '\\u003c');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonicalUrl} />
	{#if noindex}
		<meta name="robots" content="noindex, nofollow" />
	{/if}

	<!-- Open Graph -->
	<meta property="og:type" content={type} />
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={imageUrl} />

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={imageUrl} />

	{#each blocks as block, i (i)}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html `<script type="application/ld+json">${serialize(block)}</` + `script>`}
	{/each}
</svelte:head>
