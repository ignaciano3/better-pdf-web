# Per-tool SEO Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six indexable SEO landing pages (`/fill-pdf-form`, `/sign-pdf`, `/merge-pdf`, `/split-pdf`, `/watermark-pdf`, `/edit-pdf`) driven by a content registry, each funneling into the editor with the relevant tool activated.

**Architecture:** A typed content registry (`src/lib/seo/tools.ts`) feeds a single dynamic route (`src/routes/[tool]/`), the sitemap, home-page cross-links, and footer links. The editor's existing `?operation=` deep-link effect is extended via a pure, testable `planOperation()` mapper plus a post-load intent that opens the right panel/modal.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes mode forced), Tailwind CSS 4, Vitest (two projects: `server` node env for `*.test.ts`, `client` jsdom for `*.svelte.test.ts`).

## Global Constraints

- Use **bun**, never pnpm/npm: full suite `bun run test`, single file `bunx vitest run <path>`, typecheck `bun run check`.
- Prettier: format **only files you touched** (`bunx prettier --write <files>`); the repo is not prettier-clean, never run repo-wide format.
- **Copy rules (from spec, fact-checked):** the phrase "files never leave your browser" (or any equivalent absolute claim) is BANNED — uploads and exports DO send PDF bytes to the server. Allowed claims: editing runs in the browser; files are processed in memory and never stored; no watermarks ever added; free tier is 2 exports/hour anonymous, 5/hour signed-in, Pro unlimited at $6/mo (or $48/year).
- Canonical USP phrasing: "Private by design — editing happens in your browser, and when you export, your files are processed in memory and never stored."
- Tool pages are **SSR, not prerendered** (root layout `load` resolves the signed-in user; prerendering would bake a logged-out header into static HTML). This amends the spec — Task 1 updates the spec file.
- Svelte 5 runes syntax only (`$state`, `$derived`, `$effect`, `$props`); follow existing file style (tabs, single quotes).
- Work happens on the existing `seo-tool-landing-pages` branch.

---

### Task 1: Content registry (`src/lib/seo/tools.ts`)

**Files:**
- Modify: `docs/superpowers/specs/2026-07-09-seo-tool-landing-pages-design.md` (prerender → SSR amendment)
- Create: `src/lib/seo/tools.ts`
- Test: `src/lib/seo/tools.test.ts`

**Interfaces:**
- Consumes: nothing (pure data module, no imports).
- Produces (used by Tasks 2–5):
  - `interface ToolStep { title: string; text: string }`
  - `interface ToolFaq { q: string; a: string }`
  - `type ToolOperation = 'fill' | 'sign' | 'merge' | 'split' | 'watermark' | 'edit'`
  - `interface ToolPage { slug: string; operation: ToolOperation; title: string; metaDescription: string; h1: string; heroCopy: string; cardBlurb: string; steps: [ToolStep, ToolStep, ToolStep]; faq: ToolFaq[] }`
  - `const TOOLS: ToolPage[]` (6 entries)
  - `function getTool(slug: string): ToolPage | undefined`
  - `function isToolPath(pathname: string): boolean` (true for `/merge-pdf` etc., false otherwise)

- [ ] **Step 1: Amend the spec (prerender → SSR) and commit**

In `docs/superpowers/specs/2026-07-09-seo-tool-landing-pages-design.md`, replace the sentence beginning `export const prerender = true` (in **Architecture**) with:

```markdown
The route is **SSR, not prerendered**: the root layout's server `load`
resolves the signed-in user, so prerendering would bake a logged-out header
into the static HTML. The registry lookup is trivially cheap; SSR matches
every other page (nothing in the repo prerenders today).
```

```bash
git add docs/superpowers/specs/2026-07-09-seo-tool-landing-pages-design.md
git commit -m "docs: amend spec — tool pages are SSR, not prerendered"
```

- [ ] **Step 2: Write the failing registry test**

Create `src/lib/seo/tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TOOLS, getTool, isToolPath } from './tools';

const VALID_OPERATIONS = ['fill', 'sign', 'merge', 'split', 'watermark', 'edit'];

describe('TOOLS registry', () => {
	it('has exactly the six v1 tools', () => {
		expect(TOOLS.map((t) => t.slug).sort()).toEqual([
			'edit-pdf',
			'fill-pdf-form',
			'merge-pdf',
			'sign-pdf',
			'split-pdf',
			'watermark-pdf'
		]);
	});

	it('has unique, URL-safe slugs', () => {
		const slugs = TOOLS.map((t) => t.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
	});

	it('every entry has a valid operation and complete copy', () => {
		for (const t of TOOLS) {
			expect(VALID_OPERATIONS).toContain(t.operation);
			expect(t.title.length).toBeGreaterThan(10);
			expect(t.metaDescription.length).toBeGreaterThan(50);
			expect(t.metaDescription.length).toBeLessThanOrEqual(170);
			expect(t.h1.length).toBeGreaterThan(5);
			expect(t.heroCopy.length).toBeGreaterThan(50);
			expect(t.cardBlurb.length).toBeGreaterThan(10);
			expect(t.steps).toHaveLength(3);
			for (const s of t.steps) {
				expect(s.title.length).toBeGreaterThan(2);
				expect(s.text.length).toBeGreaterThan(20);
			}
			expect(t.faq.length).toBeGreaterThanOrEqual(4);
			expect(t.faq.length).toBeLessThanOrEqual(6);
			for (const f of t.faq) {
				expect(f.q.length).toBeGreaterThan(5);
				expect(f.a.length).toBeGreaterThan(20);
			}
		}
	});

	it('never claims files do not leave the browser', () => {
		// Uploads and exports DO send bytes to the server; this claim is banned.
		const all = JSON.stringify(TOOLS).toLowerCase();
		expect(all).not.toContain('never leave your browser');
		expect(all).not.toContain('never leaves your browser');
		expect(all).not.toContain('never sent to a server');
		expect(all).not.toContain('never uploaded');
	});

	it('getTool finds known slugs and rejects unknown ones', () => {
		expect(getTool('merge-pdf')?.operation).toBe('merge');
		expect(getTool('nope')).toBeUndefined();
	});

	it('isToolPath matches tool paths only', () => {
		expect(isToolPath('/merge-pdf')).toBe(true);
		expect(isToolPath('/pricing')).toBe(false);
		expect(isToolPath('/')).toBe(false);
		expect(isToolPath('/merge-pdf/extra')).toBe(false);
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx vitest run src/lib/seo/tools.test.ts`
Expected: FAIL — cannot resolve `./tools`.

- [ ] **Step 4: Create the registry with real copy**

Create `src/lib/seo/tools.ts`:

```ts
/**
 * Content registry for the per-tool SEO landing pages (/merge-pdf, …).
 * Drives the [tool] route, the sitemap, home-page cross-links and the
 * footer. Adding a tool page = adding one entry here.
 *
 * Copy rules (see docs/superpowers/specs/2026-07-09-seo-tool-landing-pages-design.md):
 * never claim files don't leave the browser — uploads/exports DO send bytes
 * to the server. The honest claim is "processed in memory, never stored".
 */

export interface ToolStep {
	title: string;
	text: string;
}

export interface ToolFaq {
	q: string;
	a: string;
}

export type ToolOperation = 'fill' | 'sign' | 'merge' | 'split' | 'watermark' | 'edit';

export interface ToolPage {
	/** URL path segment, e.g. `merge-pdf`. */
	slug: string;
	/** Editor deep-link value for `/editor?operation=`. */
	operation: ToolOperation;
	/** Full <title> / OG title. */
	title: string;
	metaDescription: string;
	h1: string;
	/** One-paragraph hero value prop. */
	heroCopy: string;
	/** One-liner for cross-link cards. */
	cardBlurb: string;
	steps: [ToolStep, ToolStep, ToolStep];
	faq: ToolFaq[];
}

const PRIVACY_FAQ: ToolFaq = {
	q: 'Are my files stored on your servers?',
	a: 'No. Editing happens in your browser, and when you export, your file is only processed in memory to build the PDF, then discarded. We never store your documents and never add watermarks.'
};

const COST_FAQ: ToolFaq = {
	q: 'What does it cost?',
	a: 'Nothing for everyday use. You get 2 free exports per hour without an account, or 5 per hour signed in. Pro is $6/mo (or $48/year) for unlimited exports.'
};

export const TOOLS: ToolPage[] = [
	{
		slug: 'fill-pdf-form',
		operation: 'fill',
		title: 'Fill a PDF form online, free — Better PDF Web',
		metaDescription:
			'Fill out PDF forms online for free. Text fields, checkboxes, radio buttons and dropdowns are detected automatically — complete, sign and download with no watermarks.',
		h1: 'Fill a PDF form online',
		heroCopy:
			'Upload a PDF and its form fields are detected automatically. Type into text boxes, tick checkboxes, pick from dropdowns — then download the finished file. Free, no sign-up, no watermarks.',
		cardBlurb: 'Complete text fields, checkboxes and dropdowns in any PDF form.',
		steps: [
			{
				title: 'Upload your form',
				text: 'Drop in the PDF. Fillable AcroForm fields — text, checkboxes, radios, dropdowns — are detected and made editable automatically.'
			},
			{
				title: 'Fill it in',
				text: 'Click any field and type, tick or pick. You can also add a drawn signature or extra text anywhere on the page.'
			},
			{
				title: 'Download',
				text: 'Export the completed form as a PDF. No account needed and no watermark added — ever.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'What kinds of fields can I fill?',
				a: 'Everything a standard PDF form (AcroForm) defines: single and multi-line text fields, checkboxes, radio buttons, dropdowns and list boxes. They are detected automatically when you upload.'
			},
			{
				q: 'What if my PDF has no fillable fields?',
				a: 'You can still complete it: add text boxes anywhere on the page, place checkmarks, and draw a signature — the result looks the same when you download.'
			},
			{
				q: 'Can I sign the form too?',
				a: 'Yes. Draw your signature with a mouse or finger and place it on the document before exporting.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'sign-pdf',
		operation: 'sign',
		title: 'Sign a PDF online, free — Better PDF Web',
		metaDescription:
			'Sign PDF documents online for free. Draw your signature with a mouse or finger, place it on the page, and download — no account, no watermarks.',
		h1: 'Sign a PDF online',
		heroCopy:
			'Draw your signature with a mouse, trackpad or finger, place it exactly where it belongs, and download the signed document. Free, no sign-up, no watermarks.',
		cardBlurb: 'Draw your signature and place it anywhere in the document.',
		steps: [
			{
				title: 'Upload your PDF',
				text: 'Open the document you need to sign — a contract, an approval, a permission slip. It renders right in your browser.'
			},
			{
				title: 'Draw and place your signature',
				text: 'Sketch your signature on the signature pad, then click where it should go. Resize and reposition it until it sits right.'
			},
			{
				title: 'Download the signed PDF',
				text: 'Export and send it on. The signature is embedded in the page, with no watermark added.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'Is this a certified digital signature?',
				a: 'No — it places a visual signature image on the page, which is what most everyday paperwork expects. It is not a cryptographic certificate-based signature.'
			},
			{
				q: 'Can I sign on my phone?',
				a: 'Yes. The signature pad supports touch, so drawing with a finger on a phone or tablet works well.'
			},
			{
				q: 'Can I fill in the rest of the form too?',
				a: 'Yes. Form fields in the PDF are detected automatically, and you can add text anywhere on the page alongside your signature.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'merge-pdf',
		operation: 'merge',
		title: 'Merge PDF files online, free — Better PDF Web',
		metaDescription:
			'Combine multiple PDFs into one document online, free. Append files, reorder and rotate pages, then download the merged PDF with no watermarks.',
		h1: 'Merge PDF files online',
		heroCopy:
			'Combine two or more PDFs into a single document. Append files, then drag pages into exactly the order you want before downloading. Free, no sign-up, no watermarks.',
		cardBlurb: 'Combine multiple PDFs into one document, in the order you want.',
		steps: [
			{
				title: 'Upload your first PDF',
				text: 'Open the document that should come first. It loads straight into the editor in your browser.'
			},
			{
				title: 'Append the others',
				text: 'Add each additional PDF — its pages are appended to the document. Reorder, rotate or remove pages in the Pages panel until the sequence is right.'
			},
			{
				title: 'Download the merged PDF',
				text: 'Export a single combined document. No account needed and no watermark added.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'How many PDFs can I merge?',
				a: 'You can append multiple documents up to a combined 60 MB per export — more than enough for typical contracts, scans and reports.'
			},
			{
				q: 'Can I change the page order after merging?',
				a: 'Yes. The Pages panel shows every page as a thumbnail — move pages up or down, rotate them, or delete the ones you don’t need before exporting.'
			},
			{
				q: 'Can I edit the merged document too?',
				a: 'Yes. Before exporting you can fill fields, add text, images and signatures — it’s a full editor, not just a merger.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'split-pdf',
		operation: 'split',
		title: 'Split a PDF online, free — Better PDF Web',
		metaDescription:
			'Extract or remove pages from a PDF online, free. Delete the pages you don’t need, reorder the rest, and download the result — no watermarks.',
		h1: 'Split a PDF online',
		heroCopy:
			'Pull the pages you need out of any PDF. Delete the rest, reorder what’s left, and download a clean document. Free, no sign-up, no watermarks.',
		cardBlurb: 'Extract the pages you need and drop the ones you don’t.',
		steps: [
			{
				title: 'Upload your PDF',
				text: 'Open the document. Every page appears as a thumbnail in the Pages panel.'
			},
			{
				title: 'Keep only what you need',
				text: 'Delete unwanted pages, reorder or rotate the ones you keep. The thumbnails update as you go.'
			},
			{
				title: 'Download the result',
				text: 'Export a new PDF containing just the pages you kept, in the order you arranged.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'How do I extract just a few pages?',
				a: 'Delete every page you don’t want in the Pages panel and export — the download contains only the pages you kept. To produce several outputs, repeat with the same source file.'
			},
			{
				q: 'Can I reorder or rotate pages too?',
				a: 'Yes. The Pages panel lets you move pages up and down, rotate them 90° at a time, and insert blank pages.'
			},
			{
				q: 'Does splitting change the quality?',
				a: 'No. Kept pages are carried over from the original document, not re-rendered, so text and images stay exactly as they were.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'watermark-pdf',
		operation: 'watermark',
		title: 'Add a watermark to a PDF online, free — Better PDF Web',
		metaDescription:
			'Watermark a PDF online, free. Stamp text like DRAFT or CONFIDENTIAL — or your logo — across every page with adjustable opacity, then download.',
		h1: 'Add a watermark to a PDF',
		heroCopy:
			'Stamp “DRAFT”, “CONFIDENTIAL” or your own text — or an image like a logo — across every page, with adjustable opacity. Free, no sign-up, and we never add watermarks of our own.',
		cardBlurb: 'Stamp text or a logo across every page, with adjustable opacity.',
		steps: [
			{
				title: 'Upload your PDF',
				text: 'Open the document you want to mark. It renders right in your browser.'
			},
			{
				title: 'Set your watermark',
				text: 'Choose text (like DRAFT) or upload an image, then tune the opacity so it reads clearly without drowning the content.'
			},
			{
				title: 'Download',
				text: 'Export the watermarked PDF. The mark is applied to every page of the document.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'Can I use an image as the watermark?',
				a: 'Yes. Upload a PNG or JPEG — your logo, a stamp — and it’s placed across the pages instead of text. You can resize it and adjust its opacity.'
			},
			{
				q: 'Does it apply to every page?',
				a: 'Yes, the watermark is stamped on every page of the exported document.'
			},
			{
				q: 'Do you add your own watermark on the free tier?',
				a: 'Never. Unlike many free PDF tools, exports are clean on every tier — the only watermark on your document is the one you choose to add.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'edit-pdf',
		operation: 'edit',
		title: 'Edit a PDF online, free — Better PDF Web',
		metaDescription:
			'Edit PDFs online, free. Add text, images, shapes, links and signatures, fill forms, and manage pages — right in your browser, with no watermarks.',
		h1: 'Edit a PDF online',
		heroCopy:
			'Add text, images, shapes, links and signatures. Fill forms, manage pages, set a watermark — a full PDF editor that runs in your browser. Free, no sign-up, no watermarks.',
		cardBlurb: 'Add text, images, shapes, links and signatures to any PDF.',
		steps: [
			{
				title: 'Upload your PDF',
				text: 'Open an existing document, or start from a blank page. Everything renders and edits right in your browser.'
			},
			{
				title: 'Make your changes',
				text: 'Add text blocks, images, shapes and links. Fill form fields, draw a signature, reorder pages — with undo/redo for every step.'
			},
			{
				title: 'Download',
				text: 'Export the finished PDF. No account needed and no watermark added.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'Can I change text that’s already in the PDF?',
				a: 'Not yet. You add new content on top of the existing pages — text, images, shapes, links, fields and signatures — but existing text can’t be rewritten in place.'
			},
			{
				q: 'Can I use my own fonts?',
				a: 'Yes. Embed custom TTF/OTF fonts with full Unicode coverage, including CJK scripts and symbols.'
			},
			{
				q: 'Does it work on mobile?',
				a: 'Yes. The editor supports touch, so you can edit, draw and drag pages around on phones and tablets.'
			},
			COST_FAQ
		]
	}
];

export function getTool(slug: string): ToolPage | undefined {
	return TOOLS.find((t) => t.slug === slug);
}

/** True for exactly `/<slug>` of a registered tool — used by the layout to give tool pages the full-bleed treatment. */
export function isToolPath(pathname: string): boolean {
	return TOOLS.some((t) => pathname === `/${t.slug}`);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bunx vitest run src/lib/seo/tools.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Format and commit**

```bash
bunx prettier --write src/lib/seo/tools.ts src/lib/seo/tools.test.ts
git add src/lib/seo/tools.ts src/lib/seo/tools.test.ts
git commit -m "feat(seo): content registry for per-tool landing pages"
```

---

### Task 2: `[tool]` dynamic route

**Files:**
- Create: `src/routes/[tool]/+page.ts`
- Create: `src/routes/[tool]/+page.svelte`
- Modify: `src/routes/+layout.svelte:13-14` (full-bleed check)
- Test: `src/routes/[tool]/page.test.ts`

**Interfaces:**
- Consumes: `getTool`, `isToolPath`, `TOOLS`, `type ToolPage` from `$lib/seo/tools` (Task 1); `Seo.svelte` props `{ title, description, jsonLd }`; `ToolCards.svelte` from Task 3 is NOT used yet (added in Task 3).
- Produces: page data shape `{ tool: ToolPage }` for `+page.svelte`; routes `/<slug>` for all six slugs, 404 otherwise.

- [ ] **Step 1: Write the failing load test**

Create `src/routes/[tool]/page.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { load } from './+page';

function loadFor(slug: string) {
	// Only `params` is read by this load function.
	return (load as (e: { params: { tool: string } }) => { tool: { slug: string } })({
		params: { tool: slug }
	});
}

describe('[tool] page load', () => {
	it('returns registry data for a known slug', () => {
		const data = loadFor('merge-pdf');
		expect(data.tool.slug).toBe('merge-pdf');
	});

	it('throws 404 for an unknown slug', () => {
		try {
			loadFor('not-a-tool');
			expect.unreachable('should have thrown');
		} catch (e) {
			expect((e as { status: number }).status).toBe(404);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run 'src/routes/[tool]/page.test.ts'`
Expected: FAIL — cannot resolve `./+page`.

- [ ] **Step 3: Implement the load function**

Create `src/routes/[tool]/+page.ts`:

```ts
import { error } from '@sveltejs/kit';
import { getTool } from '$lib/seo/tools';
import type { PageLoad } from './$types';

// SSR (not prerendered): the root layout load resolves the signed-in user,
// so prerendering would bake a logged-out header into static HTML.
export const load: PageLoad = ({ params }) => {
	const tool = getTool(params.tool);
	if (!tool) error(404, 'Not found');
	return { tool };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run 'src/routes/[tool]/page.test.ts'`
Expected: PASS (2 tests). (If `./$types` is missing, run `bun run prepare` first to sync SvelteKit types.)

- [ ] **Step 5: Create the page component**

Create `src/routes/[tool]/+page.svelte` (visual patterns copied from `src/routes/+page.svelte` so the site reads as one design):

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Seo, { SITE_NAME } from '$lib/components/Seo.svelte';

	let { data } = $props();
	const tool = $derived(data.tool);

	const editorHref = $derived(`${resolve('/editor')}?operation=${tool.operation}`);
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
					href={editorHref}
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
					href={editorHref}
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
```

- [ ] **Step 6: Give tool pages the full-bleed layout**

In `src/routes/+layout.svelte`, add the import and widen the home check. Change:

```svelte
	// The landing page is full-bleed (its own section padding); other routes get padded main.
	const isHome = $derived(page.url.pathname === '/');
```

to:

```svelte
	import { isToolPath } from '$lib/seo/tools';
```

(import goes with the other imports at the top of the script) and:

```svelte
	// The landing page and the SEO tool pages are full-bleed (their own section
	// padding); other routes get the padded main.
	const isHome = $derived(page.url.pathname === '/' || isToolPath(page.url.pathname));
```

- [ ] **Step 7: Verify in the browser**

Run: `bun run dev` (background), then load `http://localhost:5173/merge-pdf`.
Expected: full-bleed page with hero, USP strip, 3 steps, FAQ, dark CTA; header shows normally. `http://localhost:5173/not-a-tool` shows the 404 error page. `/pricing` still renders (no route shadowing).

- [ ] **Step 8: Typecheck, format, commit**

```bash
bun run check
bunx prettier --write 'src/routes/[tool]/+page.ts' 'src/routes/[tool]/+page.svelte' 'src/routes/[tool]/page.test.ts' src/routes/+layout.svelte
git add 'src/routes/[tool]' src/routes/+layout.svelte
git commit -m "feat(seo): dynamic [tool] landing-page route"
```

---

### Task 3: Cross-link cards (`ToolCards.svelte`) on tool pages and home

**Files:**
- Create: `src/lib/components/ToolCards.svelte`
- Modify: `src/routes/[tool]/+page.svelte` (add "More PDF tools" section before the closing CTA)
- Modify: `src/routes/+page.svelte` (add "Tools" section after FEATURES; add footer tool links)

**Interfaces:**
- Consumes: `TOOLS`, `type ToolPage` from `$lib/seo/tools`.
- Produces: `ToolCards.svelte` with props `{ tools: ToolPage[] }` — renders a responsive card grid of links to `/<slug>`.

- [ ] **Step 1: Create the card grid component**

Create `src/lib/components/ToolCards.svelte`:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ToolPage } from '$lib/seo/tools';

	let { tools }: { tools: ToolPage[] } = $props();
</script>

<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
	{#each tools as t (t.slug)}
		<a
			href={resolve('/[tool]', { tool: t.slug })}
			class="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-600/45 hover:shadow-md"
		>
			<h3 class="font-display text-base font-semibold text-slate-900 group-hover:text-blue-600">
				{t.h1}
			</h3>
			<p class="mt-1.5 text-sm leading-relaxed text-slate-600">{t.cardBlurb}</p>
		</a>
	{/each}
</div>
```

- [ ] **Step 2: Add "More PDF tools" to the tool page**

In `src/routes/[tool]/+page.svelte`, add to the script imports:

```svelte
	import { TOOLS } from '$lib/seo/tools';
	import ToolCards from '$lib/components/ToolCards.svelte';
```

and below them:

```svelte
	const otherTools = $derived(TOOLS.filter((t) => t.slug !== tool.slug));
```

Insert this section between the FAQ section and the CLOSING CTA section:

```svelte
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
```

- [ ] **Step 3: Add the Tools section to the home page**

In `src/routes/+page.svelte`, add to the script imports:

```svelte
	import { TOOLS } from '$lib/seo/tools';
	import ToolCards from '$lib/components/ToolCards.svelte';
```

Insert between the FEATURES section (ends `</section>` at the `<!-- HOW IT WORKS -->` comment) and HOW IT WORKS:

```svelte
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
```

- [ ] **Step 4: Add tool links to the home footer**

In the FOOTER of `src/routes/+page.svelte`, directly after the `<div class="my-7 h-px bg-slate-200"></div>` divider, insert:

```svelte
			<nav class="mb-7 flex flex-wrap gap-x-6 gap-y-2">
				{#each TOOLS as t (t.slug)}
					<a
						href={resolve('/[tool]', { tool: t.slug })}
						class="text-[13px] text-slate-500 transition hover:text-slate-900">{t.h1}</a
					>
				{/each}
			</nav>
```

- [ ] **Step 5: Verify in the browser**

With `bun run dev` running: home page shows the Tools card grid and footer links; `/merge-pdf` shows five "More PDF tools" cards (not itself); clicking cards navigates between tool pages.

- [ ] **Step 6: Typecheck, format, commit**

```bash
bun run check
bunx prettier --write src/lib/components/ToolCards.svelte 'src/routes/[tool]/+page.svelte' src/routes/+page.svelte
git add src/lib/components/ToolCards.svelte 'src/routes/[tool]/+page.svelte' src/routes/+page.svelte
git commit -m "feat(seo): cross-link tool cards on home and tool pages"
```

---

### Task 4: Registry-driven sitemap

**Files:**
- Modify: `src/routes/sitemap.xml/+server.ts:5-8`
- Test: `src/routes/sitemap.xml/server.test.ts`

**Interfaces:**
- Consumes: `TOOLS` from `$lib/seo/tools`.
- Produces: sitemap listing `/`, `/pricing`, and all six tool paths.

- [ ] **Step 1: Write the failing sitemap test**

Create `src/routes/sitemap.xml/server.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GET } from './+server';
import { TOOLS } from '$lib/seo/tools';

describe('sitemap.xml', () => {
	it('lists the static pages and every tool page', async () => {
		const res = (GET as (e: { url: URL }) => Response)({
			url: new URL('https://example.com/sitemap.xml')
		});
		const body = await res.text();
		expect(body).toContain('<loc>https://example.com/</loc>');
		expect(body).toContain('<loc>https://example.com/pricing</loc>');
		for (const t of TOOLS) {
			expect(body).toContain(`<loc>https://example.com/${t.slug}</loc>`);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/routes/sitemap.xml/server.test.ts`
Expected: FAIL — tool `<loc>` entries missing.

- [ ] **Step 3: Derive tool entries from the registry**

In `src/routes/sitemap.xml/+server.ts`, add the import and extend `PAGES`:

```ts
import type { RequestHandler } from './$types';
import { TOOLS } from '$lib/seo/tools';

// Public, indexable pages only. App/auth routes (/editor, /login, /signup,
// /admin) are intentionally excluded — they're noindex and robots-disallowed.
const PAGES = [
	{ path: '/', changefreq: 'weekly', priority: '1.0' },
	{ path: '/pricing', changefreq: 'monthly', priority: '0.8' },
	...TOOLS.map((t) => ({ path: `/${t.slug}`, changefreq: 'weekly', priority: '0.9' }))
];
```

(The `GET` handler below stays unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/routes/sitemap.xml/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
bunx prettier --write src/routes/sitemap.xml/+server.ts src/routes/sitemap.xml/server.test.ts
git add src/routes/sitemap.xml
git commit -m "feat(seo): tool pages in sitemap, derived from registry"
```

---

### Task 5: Editor deep-link intents

**Files:**
- Create: `src/routes/editor/operation-intent.ts`
- Modify: `src/routes/editor/+page.svelte:40-50` (operation effect), `:55-62` (`onEmptyUpload`), plus a hidden merge input in the markup
- Test: `src/routes/editor/operation-intent.test.ts`

**Interfaces:**
- Consumes: existing editor surface — `editor.showPages` (boolean `$state`), `editor.watermarkModalOpen` (boolean `$state`), `editor.appendPdf(file: File)`, page-local `showSignaturePad` state, page-local `emptyUploadInput` ref.
- Produces:
  - `type PostLoadIntent = 'merge' | 'split' | 'sign' | 'watermark'`
  - `interface OperationPlan { startBlank: boolean; openPicker: boolean; intent: PostLoadIntent | null }`
  - `function planOperation(op: string | null): OperationPlan`

- [ ] **Step 1: Write the failing mapper test**

Create `src/routes/editor/operation-intent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planOperation } from './operation-intent';

describe('planOperation', () => {
	it('maps `new` to a blank start without the picker', () => {
		expect(planOperation('new')).toEqual({ startBlank: true, openPicker: false, intent: null });
	});

	it('maps picker-only operations with no post-load intent', () => {
		for (const op of ['upload', 'fill', 'edit']) {
			expect(planOperation(op)).toEqual({ startBlank: false, openPicker: true, intent: null });
		}
	});

	it('maps intent operations to picker + matching intent', () => {
		for (const op of ['merge', 'split', 'sign', 'watermark'] as const) {
			expect(planOperation(op)).toEqual({ startBlank: false, openPicker: true, intent: op });
		}
	});

	it('ignores unknown and missing operations', () => {
		expect(planOperation(null)).toEqual({ startBlank: false, openPicker: false, intent: null });
		expect(planOperation('bogus')).toEqual({ startBlank: false, openPicker: false, intent: null });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/routes/editor/operation-intent.test.ts`
Expected: FAIL — cannot resolve `./operation-intent`.

- [ ] **Step 3: Implement the mapper**

Create `src/routes/editor/operation-intent.ts`:

```ts
/**
 * Maps the `?operation=` deep-link value (from home CTAs and the SEO tool
 * landing pages) to what the editor should do: start blank, open the file
 * picker, and/or run a one-shot intent after the PDF loads.
 */

export type PostLoadIntent = 'merge' | 'split' | 'sign' | 'watermark';

export interface OperationPlan {
	/** `?operation=new` — skip the empty state and start a blank document. */
	startBlank: boolean;
	/** Open the upload file picker immediately. */
	openPicker: boolean;
	/** One-shot action to run once the chosen PDF has loaded. */
	intent: PostLoadIntent | null;
}

const PICKER_OPS = new Set(['upload', 'fill', 'edit', 'merge', 'split', 'sign', 'watermark']);
const INTENT_OPS = new Set<PostLoadIntent>(['merge', 'split', 'sign', 'watermark']);

export function planOperation(op: string | null): OperationPlan {
	return {
		startBlank: op === 'new',
		openPicker: op !== null && PICKER_OPS.has(op),
		intent: op !== null && INTENT_OPS.has(op as PostLoadIntent) ? (op as PostLoadIntent) : null
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/routes/editor/operation-intent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the intents into the editor page**

In `src/routes/editor/+page.svelte`:

**(a)** Add to the script imports:

```svelte
	import { planOperation, type PostLoadIntent } from './operation-intent';
```

**(b)** Add state next to `promptedUpload`:

```svelte
	let pendingIntent: PostLoadIntent | null = null;
	let mergeInput = $state<HTMLInputElement | null>(null);
```

**(c)** Replace the existing operation effect (the `// Deep-link from the home CTAs…` block) with:

```svelte
	// Deep-link from the home CTAs and SEO tool pages via `?operation=`:
	//   new                → blank canvas (skip the empty state)
	//   upload/fill/edit   → open the file picker straight away
	//   merge/split/sign/watermark → picker now + open the matching tool once loaded
	$effect(() => {
		const plan = planOperation(page.url.searchParams.get('operation'));
		if (plan.startBlank) started = true;
		if (plan.openPicker && !promptedUpload && emptyUploadInput) {
			promptedUpload = true;
			pendingIntent = plan.intent;
			emptyUploadInput.click();
		}
	});

	// One-shot: fires after the deep-linked upload finishes loading.
	function applyPendingIntent() {
		const intent = pendingIntent;
		pendingIntent = null;
		if (intent === 'merge') {
			editor.showPages = true;
			// Chain straight into picking the second document. If the browser
			// blocks the programmatic click, the user still lands on an open
			// Pages panel with the Document menu one click away.
			mergeInput?.click();
		} else if (intent === 'split') {
			editor.showPages = true;
		} else if (intent === 'sign') {
			showSignaturePad = true;
		} else if (intent === 'watermark') {
			editor.watermarkModalOpen = true;
		}
	}
```

**(d)** In `onEmptyUpload`, call the intent after the PDF loads. Replace:

```svelte
	async function onEmptyUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.loadPdf(file);
		input.value = '';
		started = true;
	}
```

with:

```svelte
	async function onEmptyUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			await editor.loadPdf(file);
			applyPendingIntent();
		}
		input.value = '';
		started = true;
	}

	async function onMergeUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.appendPdf(file);
		input.value = '';
	}
```

**(e)** Add the hidden merge input to the markup, next to `<WatermarkModal {editor} />`:

```svelte
<!-- Hidden picker for the `merge` deep-link intent: appends a second PDF
     right after the first one loads. -->
<input
	type="file"
	accept="application/pdf,.pdf"
	class="hidden"
	bind:this={mergeInput}
	onchange={onMergeUpload}
/>
```

- [ ] **Step 6: Run the editor test suites to check for regressions**

Run: `bunx vitest run src/routes/editor`
Expected: PASS — all existing editor tests plus the 4 new mapper tests.

- [ ] **Step 7: Verify in the browser**

With `bun run dev` running, using any local PDF:
- `/editor?operation=sign` → picker opens; after choosing a PDF, the signature pad appears.
- `/editor?operation=watermark` → watermark modal opens after load.
- `/editor?operation=split` → Pages panel is open after load.
- `/editor?operation=merge` → after the first PDF loads, a second picker opens; choosing another PDF appends its pages.
- `/editor?operation=upload` and `?operation=new` still behave as before.

- [ ] **Step 8: Typecheck, format, commit**

```bash
bun run check
bunx prettier --write src/routes/editor/operation-intent.ts src/routes/editor/operation-intent.test.ts src/routes/editor/+page.svelte
git add src/routes/editor/operation-intent.ts src/routes/editor/operation-intent.test.ts src/routes/editor/+page.svelte
git commit -m "feat(editor): tool deep-link intents via ?operation="
```

---

### Task 6: Full verification pass

**Files:**
- No new files; fixes only if something fails.

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch ready for PR.

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: PASS — no regressions anywhere.

- [ ] **Step 2: Typecheck and lint the branch**

Run: `bun run check`
Expected: 0 errors. Then `bunx eslint $(git diff --name-only main -- '*.ts' '*.svelte')` — expected: no errors on touched files.

- [ ] **Step 3: End-to-end smoke in the browser**

With `bun run dev`: walk `/` → footer link → `/fill-pdf-form` → CTA → editor picker opens → load a PDF → fields usable. Check `view-source:` of `/merge-pdf` contains the `<title>`, meta description, canonical, and both JSON-LD blocks (SSR output, what crawlers see). Check `/sitemap.xml` lists all eight URLs.

- [ ] **Step 4: Commit any fixes; do NOT merge or open a PR**

Stop and report status to the user (superpowers:finishing-a-development-branch decides merge/PR).
