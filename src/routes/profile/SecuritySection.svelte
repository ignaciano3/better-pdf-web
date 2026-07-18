<script lang="ts">
	import { authClient } from '$lib/auth-client';

	let busy = $state(false);
	let done = $state(false);
	let error = $state<string | null>(null);

	async function signOutOthers() {
		error = null;
		done = false;
		busy = true;
		const result = await authClient.revokeOtherSessions();
		busy = false;
		if (result.error) {
			error = result.error.message ?? 'Could not sign out other devices.';
			return;
		}
		done = true;
	}
</script>

<section class="rounded-xl border border-slate-200 bg-white p-6">
	<h2 class="mb-2 text-lg font-semibold text-slate-900">Security</h2>
	<p class="mb-4 text-sm text-slate-600">
		Signs out every other browser and device. Your current session stays active.
	</p>
	{#if error}<p class="mb-2 text-sm text-red-700">{error}</p>{/if}
	{#if done}<p class="mb-2 text-sm text-green-700">Signed out other devices.</p>{/if}
	<button
		type="button"
		onclick={signOutOthers}
		disabled={busy}
		class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
	>
		{busy ? 'Signing out…' : 'Sign out of all other devices'}
	</button>
</section>
