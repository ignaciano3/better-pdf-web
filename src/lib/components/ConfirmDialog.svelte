<script lang="ts">
	// A small, accessible confirmation for destructive or irreversible actions.
	// Prefer undo over confirms where possible; reach for this only when the
	// action genuinely can't be taken back (e.g. discarding unsaved work).
	import { tick } from 'svelte';

	interface Props {
		/** Whether the dialog is shown. Bindable so the parent can close it. */
		open: boolean;
		/** Short, specific question naming the action (not "Are you sure?"). */
		title: string;
		/** One line on the consequence of confirming. */
		message: string;
		/** Confirm button label — name the outcome, e.g. "Discard & start blank". */
		confirmLabel: string;
		/** Cancel button label — name the safe path, e.g. "Keep editing". */
		cancelLabel?: string;
		/** `danger` styles the confirm button red for destructive actions. */
		tone?: 'danger' | 'default';
		onconfirm: () => void;
		oncancel?: () => void;
	}

	let {
		open = $bindable(),
		title,
		message,
		confirmLabel,
		cancelLabel = 'Cancel',
		tone = 'default',
		onconfirm,
		oncancel
	}: Props = $props();

	let cancelButton = $state<HTMLButtonElement | null>(null);

	// Focus the safe action when the dialog opens, so Enter doesn't fire the
	// destructive one and keyboard users land inside the dialog.
	$effect(() => {
		if (open) tick().then(() => cancelButton?.focus());
	});

	function cancel() {
		open = false;
		oncancel?.();
	}
	function confirm() {
		open = false;
		onconfirm();
	}
	function onKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			cancel();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-title"
		aria-describedby="confirm-message"
		tabindex="-1"
	>
		<!-- Backdrop as a real button: click-outside-to-cancel, keyboard-accessible,
		     and out of the tab order (Esc + the dialog's own buttons handle it). -->
		<button
			type="button"
			class="absolute inset-0 cursor-default bg-black/40"
			aria-label="Dismiss dialog"
			tabindex="-1"
			onclick={cancel}
		></button>
		<div class="relative w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h2 id="confirm-title" class="text-lg font-semibold text-slate-900">{title}</h2>
			<p id="confirm-message" class="mt-2 text-sm text-slate-600">{message}</p>
			<div class="mt-5 flex justify-end gap-2">
				<button
					bind:this={cancelButton}
					onclick={cancel}
					class="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
				>
					{cancelLabel}
				</button>
				<button
					onclick={confirm}
					class="rounded-lg px-3 py-2 text-sm font-semibold text-white transition {tone === 'danger'
						? 'bg-red-600 hover:bg-red-700'
						: 'bg-blue-600 hover:bg-blue-700'}"
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
