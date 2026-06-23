<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { signOut } from '$lib/auth-client';

	let { user }: { user: { email: string } | null } = $props();

	let signingOut = $state(false);

	async function handleSignOut() {
		signingOut = true;
		await signOut();
		await invalidateAll();
		await goto(resolve('/'));
		signingOut = false;
	}
</script>

<header class="flex items-center justify-between border-b border-gray-200 px-6 py-3">
	<a href={resolve('/')} class="text-lg font-semibold text-gray-900">better-pdf-web</a>
	<nav class="flex items-center gap-4 text-sm">
		{#if user}
			<span class="text-gray-600">{user.email}</span>
			<button
				type="button"
				onclick={handleSignOut}
				disabled={signingOut}
				class="rounded-md bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
			>
				{signingOut ? 'Signing out…' : 'Log out'}
			</button>
		{:else}
			<a href={resolve('/login')} class="font-medium text-gray-900 hover:underline">Log in</a>
			<a
				href={resolve('/signup')}
				class="rounded-md bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-700"
			>
				Sign up
			</a>
		{/if}
	</nav>
</header>
