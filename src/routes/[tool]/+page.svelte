<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Seo, { SITE_NAME } from '$lib/components/Seo.svelte';
	import { TOOLS } from '$lib/seo/tools';
	import ToolCards from '$lib/components/ToolCards.svelte';

	let { data } = $props();
	const tool = $derived(data.tool);
	const otherTools = $derived(TOOLS.filter((t) => t.slug !== tool.slug));

	const origin = $derived(page.url.origin);

	const faqJsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: tool.faq.map((f: { q: string; a: string }) => ({
			'@type': 'Question',
			name: f.q,
			acceptedAnswer: { '@type': 'Answer', text: f.a }
		}))
	});

	const appJsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: `${SITE_NAME} — ${tool.h1}`,
		url: `${origin}/${tool.slug}`,
		applicationCategory: 'BusinessApplication',
		operatingSystem: 'Any (web browser)',
		description: tool.metaDescription,
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
	});
</script>

<Seo title={tool.title} description={tool.metaDescription} jsonLd={[appJsonLd, faqJsonLd]} />

<div class="bg-white font-sans text-slate-900 antialiased">
	<!-- HERO -->
	<section class="mx-auto max-w-6xl px-6 pt-20 pb-16">
		<div class="max-w-2xl">
			<h1
				class="font-display text-[clamp(2.375rem,5.2vw,3.875rem)] leading-[1.03] font-bold tracking-tight"
			>
				{tool.h1}
			</h1>
			<p class="mt-5 text-lg leading-relaxed text-slate-600">{tool.heroCopy}</p>
			<div class="mt-8">
				<a
					href="{resolve('/editor')}?operation={tool.operation}"
					class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-700"
				>
					Choose your PDF
					<span class="text-lg leading-none">→</span>
				</a>
			</div>
			<p class="mt-4.5 font-mono text-xs text-slate-400">
				Free · no sign-up required · no watermarks · files are never stored
			</p>
		</div>
	</section>

	<!-- PRIVACY / USP STRIP -->
	<section class="border-y border-slate-200 bg-blue-50/40">
		<div
			class="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 px-6 py-4.5 text-center"
		>
			<span class="text-[15px] text-slate-700">
				<span class="font-semibold text-slate-900">Private by design</span> — editing happens in your
				browser, and when you export, your files are processed in memory and never stored.
			</span>
		</div>
	</section>

	<!-- HOW IT WORKS -->
	<section class="mx-auto max-w-6xl px-6 pt-20 pb-21">
		<h2
			class="font-display max-w-md text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-bold tracking-tight text-balance"
		>
			How it works
		</h2>
		<ol class="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-3">
			{#each tool.steps as step, i (step.title)}
				<li class="border-t border-slate-200 pt-5">
					<span class="font-mono text-sm font-medium tracking-[0.08em] text-blue-600"
						>{String(i + 1).padStart(2, '0')}</span
					>
					<h3 class="font-display mt-3 text-xl font-semibold text-slate-900">{step.title}</h3>
					<p class="mt-2 text-[15px] leading-relaxed text-slate-600">{step.text}</p>
				</li>
			{/each}
		</ol>
	</section>

	<!-- FAQ -->
	<section class="border-t border-slate-200 bg-slate-50">
		<div class="mx-auto max-w-6xl px-6 pt-20 pb-21">
			<div class="grid gap-x-12 gap-y-9 md:grid-cols-[5fr_7fr]">
				<div class="md:max-w-sm">
					<h2
						class="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-bold tracking-tight text-balance"
					>
						Questions, answered
					</h2>
				</div>
				<div class="border-t border-slate-200">
					{#each tool.faq as item (item.q)}
						<details class="group border-b border-slate-200">
							<summary
								class="flex cursor-pointer list-none items-center justify-between gap-4 py-5 transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 [&::-webkit-details-marker]:hidden"
							>
								<span
									class="font-display text-lg font-semibold text-slate-900 group-hover:text-blue-600"
									>{item.q}</span
								>
								<svg
									class="h-4 w-4 flex-none text-slate-400 transition-transform duration-200 group-open:rotate-45"
									viewBox="0 0 16 16"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M8 3v10M3 8h10"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linecap="round"
									/>
								</svg>
							</summary>
							<p class="max-w-2xl pr-8 pb-5 text-[15px] leading-relaxed text-slate-600">
								{item.a}
							</p>
						</details>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<!-- MORE TOOLS -->
	<section class="mx-auto max-w-6xl px-6 pt-20 pb-21">
		<h2
			class="font-display max-w-md text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-bold tracking-tight text-balance"
		>
			More PDF tools
		</h2>
		<div class="mt-10">
			<ToolCards tools={otherTools} />
		</div>
	</section>

	<!-- CLOSING CTA -->
	<section class="bg-slate-900">
		<div class="mx-auto max-w-6xl px-6 py-18 text-center">
			<h2
				class="font-display mx-auto max-w-2xl text-[clamp(1.875rem,3.8vw,2.75rem)] leading-tight font-bold tracking-tight text-balance text-white"
			>
				{tool.h1} — right now
			</h2>
			<p class="mx-auto mt-4 max-w-md text-base leading-relaxed text-slate-300">
				Open the editor and start right away — no sign-up, no watermarks.
			</p>
			<div class="mt-8 flex flex-wrap justify-center gap-3">
				<a
					href="{resolve('/editor')}?operation={tool.operation}"
					class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-700"
				>
					Choose your PDF
					<span class="text-lg leading-none">→</span>
				</a>
			</div>
			<p class="mt-4.5 font-mono text-xs text-slate-400">
				Free up to 2 exports per hour · 5 when signed in
			</p>
		</div>
	</section>
</div>
