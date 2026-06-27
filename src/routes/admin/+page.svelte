<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import Seo from '$lib/components/Seo.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const fmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
	const PLANS = ['free', 'pro', 'root'] as const;

	function planClass(plan: string): string {
		if (plan === 'root') return 'bg-purple-100 text-purple-800';
		if (plan === 'pro') return 'bg-blue-100 text-blue-800';
		return 'bg-gray-100 text-gray-700';
	}
</script>

<Seo title="Admin · Users — Better PDF Web" description="Admin dashboard." noindex />

<main class="mx-auto max-w-5xl px-6 py-12">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900">Admin · Users</h1>
		<a href={resolve('/editor')} class="text-sm text-blue-600 hover:underline">← Editor</a>
	</div>

	<!-- Totals strip -->
	<div class="mb-6 flex flex-wrap gap-3 text-sm">
		<span class="rounded-lg bg-gray-100 px-3 py-1.5 font-medium text-gray-700">
			{data.users.length} total
		</span>
		<span class="rounded-lg bg-purple-100 px-3 py-1.5 font-medium text-purple-800">
			{data.totals.root} root
		</span>
		<span class="rounded-lg bg-blue-100 px-3 py-1.5 font-medium text-blue-800">
			{data.totals.pro} pro
		</span>
		<span class="rounded-lg bg-gray-100 px-3 py-1.5 font-medium text-gray-700">
			{data.totals.free} free
		</span>
	</div>

	<!-- Usage summary: global export activity across all actors (incl. anonymous) -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="rounded-lg border border-gray-200 px-4 py-3">
			<div class="text-2xl font-semibold text-gray-900">{data.usage.exports24h}</div>
			<div class="text-xs text-gray-500">Exports · last 24h</div>
		</div>
		<div class="rounded-lg border border-gray-200 px-4 py-3">
			<div class="text-2xl font-semibold text-gray-900">{data.usage.exportsAllTime}</div>
			<div class="text-xs text-gray-500">Exports · all time</div>
		</div>
		<div class="rounded-lg border border-gray-200 px-4 py-3">
			<div class="text-2xl font-semibold text-gray-900">{data.usage.anon24h}</div>
			<div class="text-xs text-gray-500">Anonymous · last 24h</div>
		</div>
		<div class="rounded-lg border border-gray-200 px-4 py-3">
			<div class="text-2xl font-semibold text-gray-900">{data.usage.anonAllTime}</div>
			<div class="text-xs text-gray-500">Anonymous · all time</div>
		</div>
	</div>

	{#if form?.message}
		<p
			class="mb-4 rounded-md border px-3 py-2 text-sm {form.success
				? 'border-green-200 bg-green-50 text-green-700'
				: 'border-red-200 bg-red-50 text-red-700'}"
		>
			{form.message}
		</p>
	{/if}

	<div class="overflow-x-auto rounded-lg border border-gray-200">
		<table class="w-full text-left text-sm">
			<thead class="bg-gray-50 text-gray-600">
				<tr>
					<th class="px-4 py-2 font-medium">Email</th>
					<th class="px-4 py-2 font-medium">Name</th>
					<th class="px-4 py-2 font-medium">Plan</th>
					<th class="px-4 py-2 font-medium" title="Exports in the last 24h / all time">
						Exports (24h / all)
					</th>
					<th class="px-4 py-2 font-medium">Verified</th>
					<th class="px-4 py-2 font-medium">Created</th>
					<th class="px-4 py-2 font-medium">Set plan</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100">
				{#each data.users as u (u.id)}
					<tr class="hover:bg-gray-50">
						<td class="px-4 py-2 text-gray-900">{u.email}</td>
						<td class="px-4 py-2 text-gray-700">{u.name}</td>
						<td class="px-4 py-2">
							<span class="rounded px-2 py-0.5 text-xs font-medium {planClass(u.plan)}">
								{u.plan}
							</span>
						</td>
						<td class="px-4 py-2 text-gray-600">{u.exports24h} / {u.exportsTotal}</td>
						<td class="px-4 py-2 text-gray-600">{u.emailVerified ? 'Yes' : 'No'}</td>
						<td class="px-4 py-2 text-gray-600">{fmt.format(u.createdAt)}</td>
						<td class="px-4 py-2">
							<form method="POST" action="?/setPlan" use:enhance class="flex items-center gap-1">
								<input type="hidden" name="userId" value={u.id} />
								<select name="plan" value={u.plan} class="rounded border px-1 py-0.5 text-xs">
									{#each PLANS as p (p)}
										<option value={p}>{p}</option>
									{/each}
								</select>
								<button
									type="submit"
									class="rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-gray-700"
								>
									Apply
								</button>
							</form>
						</td>
					</tr>
				{:else}
					<tr><td colspan="7" class="px-4 py-6 text-center text-gray-400">No users yet.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</main>
