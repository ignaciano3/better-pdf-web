<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const fmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

	function planClass(plan: string): string {
		if (plan === 'root') return 'bg-purple-100 text-purple-800';
		if (plan === 'pro') return 'bg-blue-100 text-blue-800';
		return 'bg-gray-100 text-gray-700';
	}
</script>

<main class="mx-auto max-w-4xl px-6 py-12">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900">Admin · Users</h1>
		<a href={resolve('/editor')} class="text-sm text-blue-600 hover:underline">← Editor</a>
	</div>

	<p class="mb-4 text-sm text-gray-500">{data.users.length} user(s)</p>

	<div class="overflow-x-auto rounded-lg border border-gray-200">
		<table class="w-full text-left text-sm">
			<thead class="bg-gray-50 text-gray-600">
				<tr>
					<th class="px-4 py-2 font-medium">Email</th>
					<th class="px-4 py-2 font-medium">Name</th>
					<th class="px-4 py-2 font-medium">Plan</th>
					<th class="px-4 py-2 font-medium">Verified</th>
					<th class="px-4 py-2 font-medium">Created</th>
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
						<td class="px-4 py-2 text-gray-600">{u.emailVerified ? 'Yes' : 'No'}</td>
						<td class="px-4 py-2 text-gray-600">{fmt.format(u.createdAt)}</td>
					</tr>
				{:else}
					<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">No users yet.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</main>
