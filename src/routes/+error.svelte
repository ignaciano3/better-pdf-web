<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	const isNotFound = $derived(page.status === 404);
	const heading = $derived(isNotFound ? 'Page not found' : 'Something went wrong');
	const message = $derived(
		isNotFound
			? "The page you're looking for doesn't exist or may have been moved."
			: (page.error?.message ?? 'An unexpected error occurred. Please try again.')
	);
</script>

<svelte:head>
	<title>{page.status} · {heading}</title>
</svelte:head>

<div class="mx-auto flex max-w-md flex-col items-center py-20 text-center">
	<p class="text-6xl font-bold tracking-tight text-blue-600">{page.status}</p>
	<h1 class="mt-4 text-2xl font-semibold text-gray-900">{heading}</h1>
	<p class="mt-2 text-sm text-gray-600">{message}</p>

	<div class="mt-8 flex items-center gap-3">
		<a
			href={resolve('/')}
			class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
		>
			Back to home
		</a>
		<a
			href={resolve('/editor')}
			class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
		>
			Open the editor
		</a>
	</div>
</div>
