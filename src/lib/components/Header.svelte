<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { signOut } from '$lib/auth-client';

	let {
		user,
		plan = 'free',
		isRoot = false
	}: {
		user: { email: string } | null;
		plan?: 'free' | 'pro' | 'root';
		isRoot?: boolean;
	} = $props();

	let signingOut = $state(false);
	let menuOpen = $state(false);
	let headerEl = $state<HTMLElement>();

	async function handleSignOut() {
		signingOut = true;
		await signOut();
		await invalidateAll();
		await goto(resolve('/'));
		signingOut = false;
		menuOpen = false;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') menuOpen = false;
	}

	function onWindowPointerdown(e: PointerEvent) {
		if (menuOpen && headerEl && !headerEl.contains(e.target as Node)) menuOpen = false;
	}
</script>

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerdown} />

<header
	bind:this={headerEl}
	class="relative z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-md"
>
	<div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
		<a href={resolve('/')} class="flex shrink-0 items-center gap-2.5">
			<div
				class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-mono text-xs font-medium text-white shadow-md shadow-blue-600/30"
			>
				PDF
			</div>
			<span class="font-display text-base font-bold tracking-tight whitespace-nowrap text-slate-900"
				>Better PDF Web</span
			>
		</a>

		<!-- Desktop nav -->
		<nav class="hidden items-center gap-6 text-sm md:flex">
			<a
				href="https://github.com/ignaciano3/better-pdf"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="better-pdf on GitHub"
				class="flex items-center text-slate-600 transition hover:text-slate-900"
			>
				<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
			</a>
			<a
				href={resolve('/pricing')}
				class="font-medium text-slate-600 transition hover:text-slate-900">Pricing</a
			>
			{#if user}
				{#if isRoot}
					<a href={resolve('/admin')} class="font-medium text-purple-700 transition hover:underline"
						>Admin</a
					>
				{/if}
				<span class="flex items-center gap-2 text-slate-500">
					{user.email}
					{#if plan === 'pro'}
						<span
							class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-blue-700 uppercase"
							>Pro</span
						>
					{/if}
				</span>
				<button
					type="button"
					onclick={handleSignOut}
					disabled={signingOut}
					class="rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
				>
					{signingOut ? 'Signing out…' : 'Log out'}
				</button>
			{:else}
				<a
					href={resolve('/login')}
					class="font-medium text-slate-600 transition hover:text-slate-900">Log in</a
				>
				<a
					href={resolve('/signup')}
					class="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-blue-700"
				>
					Sign up
				</a>
			{/if}
		</nav>

		<!-- Mobile: primary action stays one tap away; everything else folds into the menu -->
		<div class="flex shrink-0 items-center gap-2 md:hidden">
			{#if !user}
				<a
					href={resolve('/signup')}
					class="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
				>
					Sign up
				</a>
			{/if}
			<button
				type="button"
				onclick={() => (menuOpen = !menuOpen)}
				aria-expanded={menuOpen}
				aria-controls="mobile-nav"
				aria-label={menuOpen ? 'Close menu' : 'Open menu'}
				class="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
			>
				{#if menuOpen}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M6 6l12 12M18 6L6 18"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				{:else}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M4 7h16M4 12h16M4 17h16"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				{/if}
			</button>
		</div>
	</div>

	<!-- Mobile menu panel -->
	{#if menuOpen}
		<nav
			id="mobile-nav"
			class="mobile-nav absolute inset-x-0 top-full z-50 border-b border-slate-200 bg-white px-4 pt-1 pb-3 shadow-lg shadow-slate-900/5 md:hidden"
		>
			<a
				href={resolve('/pricing')}
				onclick={() => (menuOpen = false)}
				class="block rounded-lg px-2 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50"
				>Pricing</a
			>
			<a
				href="https://github.com/ignaciano3/better-pdf"
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => (menuOpen = false)}
				class="flex items-center gap-2.5 rounded-lg px-2 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50"
			>
				<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				GitHub
			</a>

			{#if user}
				{#if isRoot}
					<a
						href={resolve('/admin')}
						onclick={() => (menuOpen = false)}
						class="block rounded-lg px-2 py-3 text-base font-medium text-purple-700 transition hover:bg-slate-50"
						>Admin</a
					>
				{/if}
				<div class="mt-1 border-t border-slate-100 pt-2">
					<p class="flex items-center gap-2 px-2 py-1 text-sm text-slate-500">
						<span class="truncate">{user.email}</span>
						{#if plan === 'pro'}
							<span
								class="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold tracking-wide text-blue-700 uppercase"
								>Pro</span
							>
						{/if}
					</p>
					<button
						type="button"
						onclick={handleSignOut}
						disabled={signingOut}
						class="mt-1 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-center font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
					>
						{signingOut ? 'Signing out…' : 'Log out'}
					</button>
				</div>
			{:else}
				<a
					href={resolve('/login')}
					onclick={() => (menuOpen = false)}
					class="block rounded-lg px-2 py-3 text-base font-medium text-slate-700 transition hover:bg-slate-50"
					>Log in</a
				>
			{/if}
		</nav>
	{/if}
</header>

<style>
	.mobile-nav {
		animation: menuIn 180ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes menuIn {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.mobile-nav {
			animation: none;
		}
	}
</style>
