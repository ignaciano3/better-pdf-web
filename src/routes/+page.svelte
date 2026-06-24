<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<main class="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 py-24 text-center">
	<h1 class="text-4xl font-bold text-gray-900">Edit & create PDFs in your browser</h1>
	<p class="max-w-xl text-lg text-gray-600">
		Fill forms, add text and images, draw and sign — then export. Free up to 2 exports per hour, no
		account needed.
	</p>
	<div class="flex flex-wrap items-center justify-center gap-4">
		<a
			href={resolve('/editor')}
			class="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700"
		>
			Create new PDF
		</a>
		<a
			href="{resolve('/editor')}?upload=1"
			class="rounded-lg border border-gray-300 px-6 py-3 text-base font-semibold text-gray-800 hover:bg-gray-50"
		>
			Edit existing PDF
		</a>
	</div>
	<a href={resolve('/health')} class="text-sm text-gray-400 hover:text-gray-600">health check</a>
</main>
