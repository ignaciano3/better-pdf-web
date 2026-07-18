<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';

	let {
		name,
		email,
		emailVerified,
		hasPassword
	}: { name: string; email: string; emailVerified: boolean; hasPassword: boolean } = $props();

	let nameValue = $state(name);
	let nameError = $state<string | null>(null);
	let nameSaving = $state(false);
	let nameSaved = $state(false);

	async function saveName(event: SubmitEvent) {
		event.preventDefault();
		nameError = null;
		nameSaved = false;
		nameSaving = true;
		const result = await authClient.updateUser({ name: nameValue });
		nameSaving = false;
		if (result.error) {
			nameError = result.error.message ?? 'Could not update name.';
			return;
		}
		nameSaved = true;
		await invalidateAll();
	}

	let currentPassword = $state('');
	let newPassword = $state('');
	let pwError = $state<string | null>(null);
	let pwSaving = $state(false);
	let pwSaved = $state(false);

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		pwError = null;
		pwSaved = false;
		pwSaving = true;
		const result = await authClient.changePassword({ currentPassword, newPassword });
		pwSaving = false;
		if (result.error) {
			pwError = result.error.message ?? 'Could not change password.';
			return;
		}
		pwSaved = true;
		currentPassword = '';
		newPassword = '';
	}
</script>

<section class="rounded-xl border border-slate-200 bg-white p-6">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Account</h2>

	<form onsubmit={saveName} class="mb-6 space-y-2">
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Display name</span>
			<input
				type="text"
				bind:value={nameValue}
				autocomplete="name"
				class="w-full max-w-sm rounded-md border-slate-300"
			/>
		</label>
		{#if nameError}<p class="text-sm text-red-700">{nameError}</p>{/if}
		{#if nameSaved}<p class="text-sm text-green-700">Saved.</p>{/if}
		<button
			type="submit"
			disabled={nameSaving}
			class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
		>
			{nameSaving ? 'Saving…' : 'Save name'}
		</button>
	</form>

	<div class="mb-6">
		<span class="mb-1 block text-sm font-medium text-slate-700">Email</span>
		<p class="flex items-center gap-2 text-slate-900">
			{email}
			{#if emailVerified}
				<span
					class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-green-700 uppercase"
					>Verified</span
				>
			{/if}
		</p>
	</div>

	{#if hasPassword}
		<form onsubmit={changePassword} class="space-y-2">
			<h3 class="text-sm font-semibold text-slate-800">Change password</h3>
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Current password</span>
				<input
					type="password"
					bind:value={currentPassword}
					required
					autocomplete="current-password"
					class="w-full max-w-sm rounded-md border-slate-300"
				/>
			</label>
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">New password</span>
				<input
					type="password"
					bind:value={newPassword}
					required
					autocomplete="new-password"
					class="w-full max-w-sm rounded-md border-slate-300"
				/>
			</label>
			{#if pwError}<p class="text-sm text-red-700">{pwError}</p>{/if}
			{#if pwSaved}<p class="text-sm text-green-700">Password changed.</p>{/if}
			<button
				type="submit"
				disabled={pwSaving}
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
			>
				{pwSaving ? 'Changing…' : 'Change password'}
			</button>
		</form>
	{:else}
		<p class="text-sm text-slate-500">Signed in with Google — no password to manage.</p>
	{/if}
</section>
