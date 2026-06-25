<script lang="ts">
	import { resolve } from '$app/paths';

	type HealthState =
		| { status: 'idle' }
		| { status: 'checking' }
		| { status: 'ok'; db: string }
		| { status: 'error'; message: string };

	let health = $state<HealthState>({ status: 'idle' });

	async function checkHealth() {
		health = { status: 'checking' };
		try {
			const res = await fetch(resolve('/health'), { headers: { accept: 'application/json' } });
			const body = (await res.json()) as { status?: string; db?: string };
			health = res.ok
				? { status: 'ok', db: body.db ?? 'reachable' }
				: { status: 'error', message: body.db ?? `HTTP ${res.status}` };
		} catch {
			health = { status: 'error', message: 'unreachable' };
		}
	}
</script>

<main class="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-24 text-center">
	<h1 class="text-4xl font-bold text-gray-900">Edit & create PDFs in your browser</h1>
	<p class="max-w-xl text-lg text-gray-600">
		Fill forms, add text and images, draw and sign — then export. Free up to 2 exports per hour, no
		account needed.
	</p>
	<div class="flex flex-wrap items-center justify-center gap-4">
		<a
			href="{resolve('/editor')}?operation=new"
			class="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700"
		>
			Create new PDF
		</a>
		<a
			href="{resolve('/editor')}?operation=upload"
			class="rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-800 hover:bg-gray-50"
		>
			Edit existing PDF
		</a>
	</div>
	<div class="flex flex-col items-center gap-2">
		<button
			type="button"
			onclick={checkHealth}
			disabled={health.status === 'checking'}
			class="text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50"
		>
			{health.status === 'checking' ? 'Checking…' : 'Health check'}
		</button>
		{#if health.status === 'ok'}
			<p class="text-sm font-medium text-green-600" role="status">
				✓ App OK — database {health.db}
			</p>
		{:else if health.status === 'error'}
			<p class="text-sm font-medium text-red-600" role="status">
				✗ App unhealthy — database {health.message}
			</p>
		{/if}
	</div>
</main>
