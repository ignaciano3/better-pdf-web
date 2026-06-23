<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { signIn } from '$lib/auth-client';

	let email = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let loading = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		loading = true;
		const result = await signIn.email({ email, password });
		loading = false;
		if (result.error) {
			error = result.error.message ?? 'Could not sign in.';
			return;
		}
		await invalidateAll();
		await goto(resolve('/'));
	}

	async function handleGoogle() {
		error = null;
		await signIn.social({ provider: 'google', callbackURL: '/' });
	}
</script>

<div class="mx-auto max-w-sm">
	<h1 class="mb-6 text-2xl font-semibold text-gray-900">Log in</h1>

	{#if error}
		<p class="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
	{/if}

	<form onsubmit={handleSubmit} class="space-y-4">
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-gray-700">Email</span>
			<input
				type="email"
				bind:value={email}
				required
				autocomplete="email"
				class="w-full rounded-md border-gray-300"
			/>
		</label>
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-gray-700">Password</span>
			<input
				type="password"
				bind:value={password}
				required
				autocomplete="current-password"
				class="w-full rounded-md border-gray-300"
			/>
		</label>
		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-md bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
		>
			{loading ? 'Logging in…' : 'Log in'}
		</button>
	</form>

	<div class="my-4 text-center text-sm text-gray-400">or</div>

	<button
		type="button"
		onclick={handleGoogle}
		class="w-full rounded-md border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
	>
		Continue with Google
	</button>

	<p class="mt-6 text-center text-sm text-gray-600">
		No account?
		<a href={resolve('/signup')} class="font-medium text-gray-900 hover:underline">Sign up</a>
	</p>
</div>
