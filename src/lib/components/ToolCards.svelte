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
