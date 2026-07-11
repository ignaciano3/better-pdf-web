<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import SignaturePad from '$lib/components/SignaturePad.svelte';
	import { EditorState } from './editor.svelte';
	import Toolbar from './Toolbar.svelte';
	import Canvas from './Canvas.svelte';
	import PageManager from './PageManager.svelte';
	import ZoomControls from './ZoomControls.svelte';
	import FieldPropertiesModal from './FieldPropertiesModal.svelte';
	import DocumentPropertiesModal from './DocumentPropertiesModal.svelte';
	import OutlineEditor from './OutlineEditor.svelte';
	import WatermarkModal from './WatermarkModal.svelte';
	import UpsellModal from './UpsellModal.svelte';
	import { SHORTCUT_TO_DRAW, SELECT_SHORTCUT } from './constants';
	import Seo from '$lib/components/Seo.svelte';
	import { planOperation, type PostLoadIntent } from './operation-intent';

	const editor = new EditorState();
	// Free pdf.js worker memory (cached source documents) when leaving the editor.
	onDestroy(() => editor.dispose());
	// Warm the export WASM (~2.1 MB) once the browser is idle so the first
	// export doesn't stall on fetching + instantiating it. onMount only runs
	// client-side, so `window` is always available here.
	onMount(() => {
		const warm = () => editor.warmExportEngine();
		if ('requestIdleCallback' in window) {
			(window as Window & typeof globalThis).requestIdleCallback(warm);
		} else {
			setTimeout(warm, 1500);
		}
	});

	let showSignaturePad = $state(false);
	const signedIn = $derived(Boolean(page.data['user']));

	let started = $state(false);
	let emptyUploadInput = $state<HTMLInputElement | null>(null);
	let promptedUpload = false;
	let pendingIntent: PostLoadIntent | null = null;
	let mergeInput = $state<HTMLInputElement | null>(null);
	const showEmptyState = $derived(!editor.sourceBytes && !started && editor.elements.length === 0);

	// On phones the Pages rail would steal half the canvas width, so default it
	// closed there (it becomes an overlay drawer the user can summon). Runs once on
	// the client — effects don't run during SSR, so `window` is safe here.
	let pagesDefaulted = false;
	$effect(() => {
		if (pagesDefaulted) return;
		pagesDefaulted = true;
		if (window.matchMedia('(max-width: 639px)').matches) editor.showPages = false;
	});

	// Deep-link from the home CTAs and SEO tool pages via `?operation=`:
	//   new                → blank canvas (skip the empty state)
	//   upload/fill/edit   → open the file picker straight away
	//   merge/split/sign/watermark → picker now + open the matching tool once loaded
	$effect(() => {
		const plan = planOperation(page.url.searchParams.get('operation'));
		if (plan.startBlank) started = true;
		if (plan.openPicker && !promptedUpload && emptyUploadInput) {
			promptedUpload = true;
			pendingIntent = plan.intent;
			emptyUploadInput.click();
		}
	});

	// One-shot: fires after the deep-linked upload finishes loading.
	function applyPendingIntent() {
		const intent = pendingIntent;
		pendingIntent = null;
		if (intent === 'merge') {
			editor.showPages = true;
			// Chain straight into picking the second document. If the browser
			// blocks the programmatic click, the user still lands on an open
			// Pages panel with the Document menu one click away.
			mergeInput?.click();
		} else if (intent === 'split') {
			editor.showPages = true;
		} else if (intent === 'sign') {
			showSignaturePad = true;
		} else if (intent === 'watermark') {
			editor.watermarkModalOpen = true;
		}
	}

	function startBlank() {
		started = true;
	}
	async function onEmptyUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			await editor.loadPdf(file);
			// loadPdf never throws: it reports failure by setting errorMessage (and
			// leaving it null again is the only success signal it exposes). Only
			// fire the deep-link intent once the PDF actually loaded, otherwise
			// discard it so a bad file can't later open a tool over an empty canvas.
			if (editor.errorMessage === null) {
				applyPendingIntent();
			} else {
				pendingIntent = null;
			}
		}
		input.value = '';
		started = true;
	}

	async function onMergeUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.appendPdf(file);
		input.value = '';
	}

	function onSignatureDrawn(png: Uint8Array, aspect: number) {
		editor.pendingSignature = { image: png, format: 'png', aspect };
		editor.setTool({ type: 'draw', kind: 'signature' });
		showSignaturePad = false;
	}

	// Undo/redo shortcuts: Cmd/Ctrl+Z, and Cmd/Ctrl+Shift+Z or Ctrl+Y to redo.
	// Skip when typing in a real form control so the browser's native text undo
	// still works there; our contenteditable text elements are document state, so
	// those fall through to document-level undo.
	function onKeydown(event: KeyboardEvent) {
		// Never steal keys while the user is typing into a control or a
		// contenteditable text element.
		const target = event.target as HTMLElement | null;
		const tag = target?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

		// Esc puts the pen down (same as V) and clears any current selection. While a
		// polygon is being drawn, Esc is owned by the canvas (it cancels that
		// in-progress shape and keeps the tool), so leave it alone. No preventDefault,
		// so modals that also listen for Esc still get it.
		if (event.key === 'Escape') {
			if (!editor.polygonDraftId) {
				editor.resetTool();
				editor.select(null);
			}
			return;
		}

		if (event.metaKey || event.ctrlKey) {
			const key = event.key.toLowerCase();
			if (key === 'z' && !event.shiftKey) {
				event.preventDefault();
				editor.undo();
			} else if ((key === 'z' && event.shiftKey) || key === 'y') {
				event.preventDefault();
				editor.redo();
			}
			return;
		}

		// Backspace / Delete removes the selected element. The typing guard above
		// already exempts inputs, textareas and contenteditable text, so this never
		// fights the user's text editing.
		if (event.key === 'Backspace' || event.key === 'Delete') {
			if (editor.selectedId) {
				event.preventDefault();
				editor.removeSelected();
			}
			return;
		}

		// Plain single-key tool accelerators — only once a document is loaded, and
		// never with other modifiers held.
		if (event.altKey || event.shiftKey || showEmptyState) return;
		const key = event.key.toLowerCase();
		if (key === SELECT_SHORTCUT) {
			event.preventDefault();
			editor.resetTool();
			return;
		}
		const kind = SHORTCUT_TO_DRAW[key];
		if (!kind) return;
		event.preventDefault();
		// Signature opens the draw pad (it needs the user to draw first), the rest
		// activate their tool directly; toggling the active tool returns to select.
		if (kind === 'signature') {
			showSignaturePad = true;
		} else if (editor.activeDrawKind === kind) {
			editor.resetTool();
		} else {
			editor.setTool({ type: 'draw', kind });
		}
	}

	// Nothing persists across reloads yet, so warn before the user loses unsaved
	// edits by closing or refreshing the tab. The native prompt is the only
	// reliable mechanism here; the message string is ignored by modern browsers.
	function onBeforeUnload(event: BeforeUnloadEvent) {
		if (!editor.hasUnsavedWork) return;
		event.preventDefault();
		event.returnValue = '';
	}
</script>

<Seo
	title="PDF editor — Better PDF Web"
	description="Fill forms, add text and images, draw and sign, merge, split and reorder pages, then export — right in your browser."
	noindex
/>

<svelte:window onkeydown={onKeydown} onbeforeunload={onBeforeUnload} />

<div class="flex min-h-0 flex-1 flex-col bg-slate-100">
	<Toolbar {editor} ready={!showEmptyState} onDrawSignature={() => (showSignaturePad = true)} />

	{#if editor.errorMessage}
		<div class="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
			{editor.errorMessage}
		</div>
	{/if}

	<div class="relative flex min-h-0 flex-1">
		{#if !showEmptyState}
			{#if editor.showPages}
				<!-- On phones the rail floats over the canvas; this backdrop dismisses it
				     so the page underneath keeps full width. Hidden on sm+ where the rail
				     is a normal inline column. -->
				<button
					type="button"
					class="absolute inset-0 z-20 bg-slate-900/20 sm:hidden"
					aria-label="Close pages panel"
					onclick={() => (editor.showPages = false)}
				></button>
				<PageManager {editor} />
			{:else}
				<!-- Collapsed Pages panel: a thin tab to bring it back. -->
				<button
					type="button"
					class="flex shrink-0 items-center border-r border-slate-200 bg-white px-1.5 text-sm text-slate-500 hover:bg-slate-50"
					title="Show pages panel"
					aria-label="Show pages panel"
					onclick={() => (editor.showPages = true)}
				>
					»
				</button>
			{/if}
		{/if}
		{#if showEmptyState}
			<div class="flex flex-1 items-center justify-center">
				<div
					class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-12 py-16"
				>
					<p class="text-lg font-medium text-slate-700">Upload a PDF or start blank</p>
					<div class="flex gap-3">
						<label
							class="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
						>
							Upload PDF
							<input
								bind:this={emptyUploadInput}
								type="file"
								accept="application/pdf,.pdf"
								class="hidden"
								onchange={onEmptyUpload}
							/>
						</label>
						<button
							onclick={startBlank}
							class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
						>
							Start blank
						</button>
					</div>
					<!-- Close the trust loop up front: editing is local; export builds the
					     PDF on the server in memory and streams it back — nothing is stored. -->
					<p class="max-w-xs text-center text-xs text-slate-500">
						Your file stays in this browser while you edit. Exporting builds the PDF on our server
						and sends it straight back — your document isn’t stored.
					</p>
				</div>
			</div>
		{:else}
			<!-- Canvas region: its own positioning context so the floating zoom bar
			     anchors to the canvas area, not the Pages sidebar (#1). -->
			<div class="relative flex min-h-0 min-w-0 flex-1">
				<Canvas {editor} />
				<ZoomControls {editor} />
				<!-- Warn about links that would be silently dropped at export (#3).
				     Sits above the floating Export button. -->
				{#if editor.invalidLinks.length > 0}
					<div
						class="absolute right-6 bottom-20 z-20 max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-lg ring-1 ring-amber-300"
					>
						⚠ {editor.invalidLinks.length}
						{editor.invalidLinks.length === 1 ? 'link has' : 'links have'} no target and won’t be exported.
						Set a URL or page in each link’s toolbar.
					</div>
				{/if}
				<!-- The single, primary Export action: a floating button over the canvas,
				     close to where editing happens and always visible regardless of scroll.
				     Anchored past the canvas's reserved scrollbar gutter so it sits at the
				     viewport corner, clear of the page's content. Lift is motion-safe. -->
				<button
					onclick={() => editor.export()}
					disabled={editor.exporting}
					class="absolute right-6 bottom-6 z-20 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 disabled:opacity-50 motion-safe:hover:-translate-y-0.5"
				>
					<svg
						class="h-4 w-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
					{editor.exporting ? 'Exporting…' : 'Export PDF'}
				</button>
			</div>
		{/if}
	</div>

	{#if showSignaturePad}
		<SignaturePad onuse={onSignatureDrawn} oncancel={() => (showSignaturePad = false)} />
	{/if}

	<FieldPropertiesModal {editor} />
	<DocumentPropertiesModal {editor} />
	<OutlineEditor {editor} />
	<WatermarkModal {editor} />
	<!-- Hidden picker for the `merge` deep-link intent: appends a second PDF
	     right after the first one loads. -->
	<input
		type="file"
		accept="application/pdf,.pdf"
		class="hidden"
		bind:this={mergeInput}
		onchange={onMergeUpload}
	/>
	<UpsellModal {editor} {signedIn} />
</div>
