<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Seo, { SITE_NAME } from '$lib/components/Seo.svelte';
	import { TOOLS } from '$lib/seo/tools';
	import ToolCards from '$lib/components/ToolCards.svelte';

	const user = $derived(page.data['user'] as { email: string } | null | undefined);

	const features = [
		{
			title: 'Fill AcroForm fields',
			body: 'Complete interactive form fields — text, checkboxes, radios and dropdowns — directly on the page.'
		},
		{
			title: 'Add text & images',
			body: 'Place new text blocks and drop in images anywhere, with full control over size and position.'
		},
		{
			title: 'Draw & sign',
			body: 'Annotate freehand and add real signatures for approvals, reviews and markups.'
		},
		{
			title: 'Merge, split & reorder',
			body: 'Combine files, pull pages apart, and drag pages into exactly the order you want.'
		},
		{
			title: 'Embed custom fonts',
			body: 'Bring your own fonts with full Unicode coverage, including CJK scripts and symbols.'
		},
		{
			title: 'Add links & bookmarks',
			body: 'Place clickable links and a navigable bookmark outline in your finished documents.'
		}
	];

	const steps = [
		{
			n: '01',
			title: 'Open a PDF',
			body: 'Start a blank document or upload an existing file. Everything you do next runs right here in your browser.'
		},
		{
			n: '02',
			title: 'Edit everything',
			body: 'Fill fields, add text and images, draw, sign, then merge, split and reorder pages until it’s right.'
		},
		{
			n: '03',
			title: 'Export',
			body: 'Download your finished PDF. Free up to 2 exports per hour — no account, no watermarks.'
		}
	];

	const faqs = [
		{
			q: 'Do I need an account?',
			a: 'No. All editing tools are free with no sign-up. You get 2 exports per hour, or 5 when signed in.'
		},
		{
			q: 'Are my files private?',
			a: 'Yes. Files are never stored on our servers — they’re only sent to build your export, then discarded. We never add watermarks.'
		},
		{
			q: 'What does it cost?',
			a: 'The editor is free. Pro is $6/mo (or $48/year — that’s $4/mo) for unlimited exports and priority processing. A $3 day pass is coming soon.'
		},
		{
			q: 'What can I edit?',
			a: 'Fill AcroForm fields, add text and images, draw and sign, merge, split and reorder pages, embed custom fonts, and add links and bookmarks.'
		},
		{
			q: 'Does it work on mobile?',
			a: 'Yes. The editor supports touch, so you can draw and drag pages around on phones and tablets.'
		}
	];

	const origin = $derived(page.url.origin);

	// FAQ rich result — reuses the same Q&A shown on the page.
	const faqJsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map((f) => ({
			'@type': 'Question',
			name: f.q,
			acceptedAnswer: { '@type': 'Answer', text: f.a }
		}))
	});

	// Product/app structured data — free, browser-based PDF editor.
	const appJsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: SITE_NAME,
		url: origin,
		applicationCategory: 'BusinessApplication',
		operatingSystem: 'Any (web browser)',
		description:
			'Edit and create PDFs in your browser — fill forms, add text and images, draw, sign, merge, split and reorder pages, then export. Free, private, no account needed.',
		offers: {
			'@type': 'Offer',
			price: '0',
			priceCurrency: 'USD'
		}
	});
</script>

<Seo
	title="Better PDF Web — Edit &amp; create PDFs in your browser, free"
	description="Fill PDF forms, add text and images, draw and sign, merge, split and reorder pages — all in your browser. Free up to 2 exports per hour, no account, no watermarks."
	jsonLd={[appJsonLd, faqJsonLd]}
/>

<div class="bg-white font-sans text-slate-900 antialiased">
	<!-- HERO -->
	<section class="mx-auto max-w-6xl px-6 pt-20 pb-18">
		<div class="grid grid-cols-1 items-center gap-14 md:grid-cols-2">
			<div class="motion-safe:animate-[fadeUp_0.7s_ease_both]">
				<h1
					class="font-display mt-5 text-[clamp(2.375rem,5.2vw,3.875rem)] leading-[1.03] font-bold tracking-tight"
				>
					Edit &amp; create PDFs in your browser
				</h1>

				<p class="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
					Fill forms, add text and images, draw and sign — then export.
					<span class="font-semibold text-slate-900">Free up to 2 exports per hour</span>, no
					account needed.
				</p>

				<div class="mt-8 flex flex-wrap gap-3">
					<a
						href="{resolve('/editor')}?operation=new"
						class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-700"
					>
						Create new PDF
						<span class="text-lg leading-none">→</span>
					</a>
					<a
						href="{resolve('/editor')}?operation=upload"
						class="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5.5 py-3.5 text-base font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-600/45 hover:bg-blue-50/60"
					>
						Edit existing PDF
					</a>
				</div>

				<p class="mt-4.5 font-mono text-xs text-slate-400">
					No sign-up required · no watermarks · files are never stored on our servers
				</p>
			</div>

			<!-- EDITOR PREVIEW -->
			<div
				class="motion-safe:animate-[float_0.85s_cubic-bezier(0.22,1,0.36,1)_both] [animation-delay:0.1s]"
			>
				<div
					class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
				>
					<!-- window chrome -->
					<div class="flex items-center gap-3.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
						<div class="flex gap-1.5">
							<span class="h-2.75 w-2.75 rounded-full bg-[#ff5f57]"></span>
							<span class="h-2.75 w-2.75 rounded-full bg-[#febc2e]"></span>
							<span class="h-2.75 w-2.75 rounded-full bg-[#28c840]"></span>
						</div>
						<div class="flex flex-1 justify-center">
							<div
								class="rounded-md border border-slate-200 bg-white px-3.5 py-1 font-mono text-[11.5px] text-slate-400"
							>
								better-pdf-web / editor
							</div>
						</div>
					</div>
					<!-- toolbar row A: Upload · Document · Export -->
					<div class="flex items-center gap-2.5 border-b border-slate-100 bg-white px-3.5 py-2.25">
						<div
							class="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.25 text-[11.5px] font-semibold text-slate-700"
						>
							<span class="text-xs text-blue-600">↑</span> Upload
						</div>
						<div class="flex-1"></div>
						<div
							class="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600"
						>
							Document <span class="text-[8px] text-slate-400">▾</span>
						</div>
						<div class="rounded-md bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white">
							Export PDF
						</div>
					</div>
					<!-- toolbar row B: tool groups (clipped with right fade) -->
					<div class="relative border-b border-slate-100 bg-white">
						<div class="flex items-center gap-2.25 overflow-hidden px-3.5 py-2.25">
							<span
								class="flex-none font-mono text-[9px] font-medium tracking-[0.1em] text-slate-400"
								>CONTENT</span
							>
							<span class="flex-none text-[11.5px] font-semibold text-blue-600">Text</span>
							<span class="flex-none text-[11.5px] text-slate-600">Image</span>
							<span class="flex-none text-[11.5px] text-slate-600">Signature</span>
							<span class="flex-none text-[11.5px] text-slate-600">Link</span>
							<span class="mx-0.5 h-3.5 w-px flex-none bg-slate-200"></span>
							<span
								class="flex-none font-mono text-[9px] font-medium tracking-[0.1em] text-slate-400"
								>FIELDS</span
							>
							<span class="flex-none text-[11.5px] text-slate-600">Text field</span>
							<span class="flex-none text-[11.5px] text-slate-600">Checkbox</span>
							<span class="flex-none text-[11.5px] text-slate-600">Dropdown</span>
							<span class="mx-0.5 h-3.5 w-px flex-none bg-slate-200"></span>
							<span
								class="flex-none font-mono text-[9px] font-medium tracking-[0.1em] text-slate-400"
								>SHAPES</span
							>
							<span class="flex-none text-[11.5px] text-slate-600">Rectangle</span>
							<span class="flex-none text-[11.5px] text-slate-600">Draw</span>
						</div>
						<div
							class="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent"
						></div>
					</div>
					<!-- workspace: pages rail + canvas -->
					<div class="flex bg-slate-100">
						<!-- pages rail -->
						<div
							class="flex w-27 flex-none flex-col items-center gap-2 border-r border-slate-100 bg-white py-3"
						>
							<div class="flex w-full items-center justify-between gap-1.5 px-3 whitespace-nowrap">
								<span class="font-mono text-[9px] font-medium tracking-[0.08em] text-slate-400"
									>PAGES</span
								>
								<span class="text-[9.5px] font-semibold text-blue-600">+ Blank</span>
							</div>
							<div
								class="flex h-[70px] w-[54px] items-center justify-center rounded border-[1.5px] border-blue-600 bg-white shadow-md"
							>
								<span class="font-mono text-[8px] text-slate-300">blank</span>
							</div>
							<span class="text-[9px] text-slate-400">Page 1</span>
						</div>
						<!-- canvas -->
						<div class="relative flex flex-1 justify-center px-6 py-6.5">
							<div
								class="flex w-full max-w-[280px] flex-col gap-3 rounded bg-white px-5.5 py-6 shadow-lg shadow-slate-900/20"
							>
								<div class="h-3 w-[58%] rounded bg-slate-800"></div>
								<div class="h-1.75 w-[94%] rounded bg-slate-200"></div>
								<div class="h-1.75 w-[86%] rounded bg-slate-200"></div>
								<!-- selected editable text field -->
								<div
									class="relative my-1.25 rounded border-[1.5px] border-blue-600 bg-blue-50/60 px-2.75 py-2.5"
								>
									<div class="h-1.75 w-[70%] rounded bg-slate-700"></div>
									<span
										class="absolute -top-1 -left-1 h-1.75 w-1.75 rounded-sm border-[1.5px] border-blue-600 bg-white"
									></span>
									<span
										class="absolute -top-1 -right-1 h-1.75 w-1.75 rounded-sm border-[1.5px] border-blue-600 bg-white"
									></span>
									<span
										class="absolute -bottom-1 -left-1 h-1.75 w-1.75 rounded-sm border-[1.5px] border-blue-600 bg-white"
									></span>
									<span
										class="absolute -right-1 -bottom-1 h-1.75 w-1.75 rounded-sm border-[1.5px] border-blue-600 bg-white"
									></span>
								</div>
								<div class="h-1.75 w-[90%] rounded bg-slate-200"></div>
								<!-- checkbox fields -->
								<div class="mt-0.5 flex items-center gap-2">
									<span
										class="relative h-2.75 w-2.75 flex-none rounded-sm border-[1.5px] border-blue-600 bg-blue-600"
									>
										<span
											class="absolute top-[0.5px] left-[2.5px] h-1.5 w-[3px] rotate-45 border-r-[1.5px] border-b-[1.5px] border-white"
										></span>
									</span>
									<div class="h-1.75 w-[52%] rounded bg-slate-300"></div>
								</div>
								<div class="flex items-center gap-2">
									<span
										class="h-2.75 w-2.75 flex-none rounded-sm border-[1.5px] border-slate-300 bg-white"
									></span>
									<div class="h-1.75 w-[44%] rounded bg-slate-200"></div>
								</div>
								<!-- dropdown field -->
								<div class="mt-0.5 flex items-center gap-2.25">
									<div class="h-1.75 w-[30%] rounded bg-slate-300"></div>
									<div
										class="flex h-5.5 flex-1 items-center justify-between rounded-md border border-slate-300 bg-white px-2"
									>
										<span class="h-1.5 w-[40%] rounded bg-slate-200"></span>
										<span class="text-[8px] text-slate-400">▾</span>
									</div>
								</div>
								<!-- signature field -->
								<div
									class="relative mt-1 flex h-[42px] items-center rounded-md border border-dashed border-blue-600 bg-blue-50/50 px-3.5"
								>
									<svg width="74" height="22" viewBox="0 0 74 22" fill="none" class="opacity-80">
										<path
											d="M2 16C7 6 10 4 12 10s2 9 5 6 4-9 7-7 1 8 5 6 6-10 9-8 2 9 6 7 5-9 9-6 5 5 11 3"
											stroke="#1e293b"
											stroke-width="1.6"
											stroke-linecap="round"
										/>
									</svg>
									<span
										class="absolute top-1.5 right-2.5 font-mono text-[8px] tracking-wider text-slate-400"
										>SIGN</span
									>
								</div>
								<!-- image placeholder -->
								<div
									class="mt-1 flex h-11 items-center justify-center rounded-md border border-slate-200 [background-image:repeating-linear-gradient(45deg,#f1f5f9_0_8px,#f8fafc_8px_16px)]"
								>
									<span class="font-mono text-[10px] tracking-wider text-slate-400">IMAGE</span>
								</div>
							</div>
							<!-- zoom pill -->
							<div
								class="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.25 py-1.25 shadow-md"
							>
								<span class="text-[11px] text-slate-400">−</span>
								<span class="font-mono text-[10px] text-slate-600">400%</span>
								<span class="text-[11px] text-slate-400">+</span>
								<span class="border-l border-slate-100 pl-1 text-[10px] font-semibold text-blue-600"
									>Fit</span
								>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- TRUST STRIP -->
	<section class="border-y border-slate-200 bg-blue-50/40">
		<div
			class="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 px-6 py-4.5 text-center"
		>
			<span class="relative h-3.5 w-4 flex-none">
				<span class="absolute bottom-0 left-0 h-2.5 w-4 rounded bg-blue-600"></span>
				<span
					class="absolute top-0 left-1 h-2 w-2 rounded-t-md border-[1.6px] border-b-0 border-blue-600"
				></span>
			</span>
			<span class="text-[15px] text-slate-700">
				<span class="font-semibold text-slate-900">Private by design</span> — your files are never stored
				on our servers, only used to generate your PDF, and we never add watermarks.
			</span>
		</div>
	</section>

	<!-- FEATURES -->
	<section class="mx-auto max-w-6xl px-6 pt-22 pb-23">
		<div class="grid gap-x-12 gap-y-9 md:grid-cols-[5fr_7fr]">
			<div class="md:max-w-sm">
				<h2
					class="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-bold tracking-tight text-balance"
				>
					Everything you need to work with PDFs
				</h2>
				<p class="mt-4 text-base leading-relaxed text-slate-600">
					A full editing toolkit that runs in your browser. Your files are only sent to build the
					export — never stored on our servers.
				</p>
			</div>

			<dl class="border-t border-slate-200">
				{#each features as f (f.title)}
					<div
						class="grid gap-1.5 border-b border-slate-200 py-5 transition-colors hover:bg-slate-50/70 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-8 sm:py-6"
					>
						<dt class="font-display text-lg font-semibold text-slate-900">{f.title}</dt>
						<dd class="text-[15px] leading-relaxed text-slate-600">{f.body}</dd>
					</div>
				{/each}
			</dl>
		</div>
	</section>

	<!-- TOOLS -->
	<section class="border-t border-slate-200">
		<div class="mx-auto max-w-6xl px-6 pt-20 pb-21">
			<h2
				class="font-display max-w-md text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-bold tracking-tight text-balance"
			>
				Jump straight to a tool
			</h2>
			<p class="mt-4 max-w-lg text-base leading-relaxed text-slate-600">
				Each one opens the editor with the right tool ready to go.
			</p>
			<div class="mt-10">
				<ToolCards tools={TOOLS} />
			</div>
		</div>
	</section>

	<!-- HOW IT WORKS -->
	<section class="border-t border-slate-200 bg-slate-50">
		<div class="mx-auto max-w-6xl px-6 pt-20 pb-21">
			<h2
				class="font-display max-w-md text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-bold tracking-tight text-balance"
			>
				From file to finished in three steps
			</h2>
			<p class="mt-4 max-w-lg text-base leading-relaxed text-slate-600">
				No installs, no setup. Open the editor and you’re working.
			</p>

			<ol class="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-3">
				{#each steps as step (step.n)}
					<li class="border-t border-slate-200 pt-5">
						<span class="font-mono text-sm font-medium tracking-[0.08em] text-blue-600"
							>{step.n}</span
						>
						<h3 class="font-display mt-3 text-xl font-semibold text-slate-900">{step.title}</h3>
						<p class="mt-2 text-[15px] leading-relaxed text-slate-600">{step.body}</p>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<!-- FAQ -->
	<section class="mx-auto max-w-6xl px-6 pt-22 pb-23">
		<div class="grid gap-x-12 gap-y-9 md:grid-cols-[5fr_7fr]">
			<div class="md:max-w-sm">
				<h2
					class="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] leading-tight font-bold tracking-tight text-balance"
				>
					Questions, answered
				</h2>
				<p class="mt-4 text-base leading-relaxed text-slate-600">
					The short version: free, private, no account needed. The details are below.
				</p>
			</div>

			<div class="border-t border-slate-200">
				{#each faqs as item (item.q)}
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
						<p class="max-w-2xl pr-8 pb-5 text-[15px] leading-relaxed text-slate-600">{item.a}</p>
					</details>
				{/each}
			</div>
		</div>
	</section>

	<!-- CLOSING CTA -->
	<section class="bg-slate-900">
		<div class="mx-auto max-w-6xl px-6 py-18 text-center">
			<h2
				class="font-display mx-auto max-w-2xl text-[clamp(1.875rem,3.8vw,2.75rem)] leading-tight font-bold tracking-tight text-balance text-white"
			>
				Ready to edit your PDF?
			</h2>
			<p class="mx-auto mt-4 max-w-md text-base leading-relaxed text-slate-300">
				Open the editor and start right away — no sign-up, no watermarks.
			</p>

			<div class="mt-8 flex flex-wrap justify-center gap-3">
				<a
					href="{resolve('/editor')}?operation=new"
					class="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:-translate-y-0.5 hover:bg-blue-700"
				>
					Create new PDF
					<span class="text-lg leading-none">→</span>
				</a>
				<a
					href="{resolve('/editor')}?operation=upload"
					class="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5.5 py-3.5 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/5"
				>
					Edit existing PDF
				</a>
			</div>

			<p class="mt-4.5 font-mono text-xs text-slate-400">
				Free up to 2 exports per hour · 5 when signed in
			</p>
		</div>
	</section>

	<!-- FOOTER -->
	<footer class="border-t border-slate-200 bg-slate-50">
		<div class="mx-auto max-w-6xl px-6 pt-12 pb-10">
			<div class="flex flex-wrap items-start justify-between gap-7">
				<div>
					<div class="flex items-center gap-2.5">
						<div
							class="flex h-7.5 w-7.5 items-center justify-center rounded-lg bg-blue-600 font-mono text-[11px] font-medium text-white"
						>
							PDF
						</div>
						<span class="font-display text-[15px] font-bold">Better PDF Web</span>
					</div>
					<p class="mt-3.5 max-w-xs text-sm leading-relaxed text-slate-600">
						Edit &amp; create PDFs in your browser — privately. Your files are never stored on our
						servers, only used to generate your PDF.
					</p>
				</div>
				<nav class="flex flex-wrap gap-6" aria-label="Site">
					<a
						href={resolve('/pricing')}
						class="text-sm font-medium text-slate-600 transition hover:text-slate-900">Pricing</a
					>
					{#if user}
						<a
							href="{resolve('/editor')}?operation=new"
							class="text-sm font-medium text-slate-600 transition hover:text-slate-900">New PDF</a
						>
					{:else}
						<a
							href={resolve('/login')}
							class="text-sm font-medium text-slate-600 transition hover:text-slate-900">Log in</a
						>
						<a
							href={resolve('/signup')}
							class="text-sm font-medium text-slate-600 transition hover:text-slate-900">Sign up</a
						>
					{/if}
				</nav>
			</div>

			<div class="my-7 h-px bg-slate-200"></div>

			<nav class="mb-7 flex flex-wrap gap-x-6 gap-y-2" aria-label="PDF tools">
				{#each TOOLS as t (t.slug)}
					<a
						href={resolve('/[tool]', { tool: t.slug })}
						class="text-[13px] text-slate-500 transition hover:text-slate-900">{t.h1}</a
					>
				{/each}
			</nav>

			<div class="flex flex-wrap items-center justify-between gap-3.5">
				<span class="text-[13px] text-slate-400">© 2026 Better PDF Web</span>
				<span class="text-[13.5px] text-slate-600">
					Powered by
					<a
						href="https://github.com/ignaciano3/better-pdf"
						target="_blank"
						rel="noopener noreferrer"
						class="font-semibold text-blue-600 hover:underline">better-pdf</a
					>
					— my open-source PDF library
				</span>
			</div>
		</div>
	</footer>
</div>

<style>
	@keyframes fadeUp {
		from {
			opacity: 0;
			transform: translateY(18px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes float {
		from {
			opacity: 0;
			transform: translateY(26px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
