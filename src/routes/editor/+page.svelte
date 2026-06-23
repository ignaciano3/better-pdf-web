<script lang="ts">
	import { exportPdf } from './export.remote';
	import type { EditElement, EditState, SignatureElement, TextElement } from '$lib/pdf/types';
	import { renderSourcePdf, type RenderedPage, PdfRenderError } from '$lib/pdf/render';
	import SignaturePad from '$lib/components/SignaturePad.svelte';

	// A4 in PDF points; rendered at SCALE px per point.
	// Stable per-browser id persisted in localStorage, sent with exports so the
	// server can rate-limit anonymous callers behind a shared IP.
	function getFingerprint(): string {
		const KEY = 'bpw:fingerprint';
		let fp = localStorage.getItem(KEY);
		if (!fp) {
			fp = crypto.randomUUID();
			localStorage.setItem(KEY, fp);
		}
		return fp;
	}

	const DEFAULT_PAGE: [number, number] = [595.28, 841.89];
	const SCALE = 0.8;
	const MAX_BYTES = 50 * 1024 * 1024; // 50 MB upload guard.
	const SIG_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB signature-image guard.
	const SIG_DEFAULT_WIDTH = 180; // PDF points; height derived from aspect.

	let elements = $state<EditElement[]>([]);
	let showSignaturePad = $state(false);
	// When set, the next page click places a signature instead of text.
	let pendingSignature = $state<{
		image: Uint8Array;
		format: 'png' | 'jpg';
		aspect: number;
	} | null>(null);
	let selectedId = $state<string | null>(null);
	let exporting = $state(false);
	let loadingPdf = $state(false);
	let errorMessage = $state<string | null>(null);
	let nextId = 0;

	// When a source PDF is uploaded, these drive the canvas; in blank mode a
	// single virtual A4 page is shown.
	let sourceBytes = $state<Uint8Array | null>(null);
	let pages = $state<PageInfo[]>([{ width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] }]);
	let rendered = $state<RenderedPage[]>([]);

	interface PageInfo {
		/** Page width in PDF points. */
		width: number;
		/** Page height in PDF points. */
		height: number;
	}

	async function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		errorMessage = null;

		if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
			errorMessage = 'Please choose a PDF file.';
			input.value = '';
			return;
		}
		if (file.size > MAX_BYTES) {
			errorMessage = `That file is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`;
			input.value = '';
			return;
		}

		loadingPdf = true;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			// pdf.js transfers/detaches the buffer it renders, so keep a separate
			// copy for export.
			const exportCopy = bytes.slice();
			const result = await renderSourcePdf(bytes, SCALE);

			rendered = result;
			pages = result.map((p) => ({ width: p.width, height: p.height }));
			sourceBytes = exportCopy;
			// Reset edits when a new document is loaded.
			elements = [];
			selectedId = null;
		} catch (e) {
			errorMessage =
				e instanceof PdfRenderError
					? e.message
					: 'Could not open that PDF. It may be corrupt or unsupported.';
			input.value = '';
		} finally {
			loadingPdf = false;
		}
	}

	function clearSource() {
		sourceBytes = null;
		rendered = [];
		pages = [{ width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] }];
		elements = [];
		selectedId = null;
		errorMessage = null;
	}

	function addTextAt(clientX: number, clientY: number, pageEl: HTMLElement, pageIndex: number) {
		const rect = pageEl.getBoundingClientRect();
		const x = (clientX - rect.left) / SCALE;
		const y = (clientY - rect.top) / SCALE;
		const el: TextElement = {
			type: 'text',
			id: `t${nextId++}`,
			text: 'New text',
			x,
			y,
			size: 16,
			page: pageIndex
		};
		elements.push(el);
		selectedId = el.id;
	}

	function placeSignatureAt(
		clientX: number,
		clientY: number,
		pageEl: HTMLElement,
		pageIndex: number
	) {
		const pending = pendingSignature;
		if (!pending) return;
		const rect = pageEl.getBoundingClientRect();
		const x = (clientX - rect.left) / SCALE;
		const y = (clientY - rect.top) / SCALE;
		const width = SIG_DEFAULT_WIDTH;
		const height = width / pending.aspect;
		const el: SignatureElement = {
			type: 'signature',
			id: `s${nextId++}`,
			x,
			y,
			width,
			height,
			page: pageIndex,
			image: pending.image,
			format: pending.format
		};
		elements.push(el);
		selectedId = el.id;
		pendingSignature = null;
	}

	function onPageClick(event: MouseEvent, pageIndex: number) {
		// Only add when clicking the bare page, not an existing element.
		if (event.target !== event.currentTarget) return;
		if (pendingSignature) {
			placeSignatureAt(event.clientX, event.clientY, event.currentTarget as HTMLElement, pageIndex);
			return;
		}
		addTextAt(event.clientX, event.clientY, event.currentTarget as HTMLElement, pageIndex);
	}

	function onSignatureDrawn(png: Uint8Array, aspect: number) {
		pendingSignature = { image: png, format: 'png', aspect };
		showSignaturePad = false;
	}

	async function onSignatureUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		errorMessage = null;

		const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
		const isJpg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
		if (!isPng && !isJpg) {
			errorMessage = 'Please choose a PNG or JPG image.';
			input.value = '';
			return;
		}
		if (file.size > SIG_IMAGE_MAX_BYTES) {
			errorMessage = `That image is too large (max ${Math.round(SIG_IMAGE_MAX_BYTES / 1024 / 1024)} MB).`;
			input.value = '';
			return;
		}

		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const aspect = await imageAspect(file);
			pendingSignature = { image: bytes, format: isPng ? 'png' : 'jpg', aspect };
		} catch {
			errorMessage = 'Could not read that image.';
		} finally {
			input.value = '';
		}
	}

	function imageAspect(file: File): Promise<number> {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				resolve(img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1);
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('image decode failed'));
			};
			img.src = url;
		});
	}

	function startDrag(event: PointerEvent, el: EditElement) {
		selectedId = el.id;
		const startX = event.clientX;
		const startY = event.clientY;
		const originX = el.x;
		const originY = el.y;
		let dragging = false;

		function move(e: PointerEvent) {
			// Only treat as a drag past a small threshold, so a plain click still
			// places the text caret for editing.
			if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
			dragging = true;
			el.x = originX + (e.clientX - startX) / SCALE;
			el.y = originY + (e.clientY - startY) / SCALE;
		}
		function up() {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		}
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	function startResize(event: PointerEvent, el: SignatureElement) {
		event.stopPropagation();
		event.preventDefault();
		selectedId = el.id;
		const startX = event.clientX;
		const startWidth = el.width;
		const aspect = el.width / el.height;

		function move(e: PointerEvent) {
			const next = startWidth + (e.clientX - startX) / SCALE;
			el.width = Math.max(20, next);
			el.height = el.width / aspect;
		}
		function up() {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		}
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	function removeSelected() {
		if (selectedId) {
			elements = elements.filter((e) => e.id !== selectedId);
			selectedId = null;
		}
	}

	function elementsForPage(pageIndex: number): EditElement[] {
		return elements.filter((e) => (e.page ?? 0) === pageIndex);
	}

	// Object URLs for signature previews, cached per element id so we don't
	// recreate them on every render. Plain record — not reactive state.
	const sigUrls: Record<string, string> = {};
	function signatureUrl(el: SignatureElement): string {
		const cached = sigUrls[el.id];
		if (cached) return cached;
		const type = el.format === 'png' ? 'image/png' : 'image/jpeg';
		const buf = new ArrayBuffer(el.image.byteLength);
		new Uint8Array(buf).set(el.image);
		const url = URL.createObjectURL(new Blob([buf], { type }));
		sigUrls[el.id] = url;
		return url;
	}

	async function doExport() {
		exporting = true;
		errorMessage = null;
		try {
			const firstPage = pages[0] ?? { width: DEFAULT_PAGE[0], height: DEFAULT_PAGE[1] };
			const state: EditState = {
				pageSize: [firstPage.width, firstPage.height],
				elements: $state.snapshot(elements) as EditElement[],
				...(sourceBytes ? { sourcePdf: sourceBytes } : {})
			};
			const bytes = await exportPdf({ state, fingerprint: getFingerprint() });
			// Copy into a plain ArrayBuffer so the Blob part type is satisfied
			// (the wire value may be backed by a non-ArrayBuffer buffer).
			const buf = new ArrayBuffer(bytes.byteLength);
			new Uint8Array(buf).set(bytes);
			const blob = new Blob([buf], { type: 'application/pdf' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'document.pdf';
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Export failed. Please try again.';
		} finally {
			exporting = false;
		}
	}

	const selected = $derived(elements.find((e) => e.id === selectedId) ?? null);
	const selectedText = $derived(selected?.type === 'text' ? selected : null);
</script>

<div class="flex h-screen flex-col bg-gray-100">
	<header class="flex items-center gap-3 border-b bg-white px-4 py-2 shadow-sm">
		<h1 class="font-semibold">better-pdf editor</h1>
		<span class="text-sm text-gray-500">
			{pendingSignature
				? 'Click a page to place your signature.'
				: 'Click a page to add text. Drag to move.'}
		</span>
		<div class="ml-auto flex items-center gap-2">
			<label
				class="cursor-pointer rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
			>
				{loadingPdf ? 'Loading…' : 'Upload PDF'}
				<input
					type="file"
					accept="application/pdf,.pdf"
					class="hidden"
					disabled={loadingPdf}
					onchange={onFileChange}
				/>
			</label>
			{#if sourceBytes}
				<button
					onclick={clearSource}
					class="rounded bg-gray-50 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
				>
					New blank
				</button>
			{/if}
			<button
				onclick={() => (showSignaturePad = true)}
				class="rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
			>
				Draw signature
			</button>
			<label
				class="cursor-pointer rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
			>
				Upload signature
				<input
					type="file"
					accept="image/png,image/jpeg,.png,.jpg,.jpeg"
					class="hidden"
					onchange={onSignatureUpload}
				/>
			</label>
			{#if selectedText}
				<label class="flex items-center gap-1 text-sm">
					Size
					<input
						type="number"
						min="6"
						max="200"
						bind:value={selectedText.size}
						class="w-16 rounded border px-1 py-0.5"
					/>
				</label>
			{/if}
			{#if selected}
				<button
					onclick={removeSelected}
					class="rounded bg-red-50 px-2 py-1 text-sm text-red-700 hover:bg-red-100"
				>
					Delete
				</button>
			{/if}
			<button
				onclick={doExport}
				disabled={exporting}
				class="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
			>
				{exporting ? 'Exporting…' : 'Export PDF'}
			</button>
		</div>
	</header>

	{#if errorMessage}
		<div class="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
			{errorMessage}
		</div>
	{/if}

	<div class="flex-1 overflow-auto p-8">
		<div class="mx-auto flex w-fit flex-col gap-6">
			{#each pages as page, pageIndex (pageIndex)}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="relative bg-white shadow-lg"
					style="width: {page.width * SCALE}px; height: {page.height * SCALE}px;"
					onclick={(e) => onPageClick(e, pageIndex)}
				>
					{#if rendered[pageIndex]}
						<img
							src={rendered[pageIndex].dataUrl}
							alt={`Page ${pageIndex + 1}`}
							class="pointer-events-none absolute inset-0 h-full w-full select-none"
							draggable="false"
						/>
					{/if}
					{#each elementsForPage(pageIndex) as el (el.id)}
						{#if el.type === 'text'}
							<div
								class="absolute cursor-move whitespace-pre outline-none {selectedId === el.id
									? 'ring-2 ring-blue-400'
									: ''}"
								style="left: {el.x * SCALE}px; top: {el.y * SCALE}px; font-size: {el.size *
									SCALE}px; line-height: 1; font-family: Helvetica, Arial, sans-serif;"
								contenteditable="plaintext-only"
								onpointerdown={(e) => startDrag(e, el)}
								oninput={(e) => (el.text = (e.currentTarget as HTMLElement).innerText)}
							>
								{el.text}
							</div>
						{:else}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="absolute cursor-move {selectedId === el.id ? 'ring-2 ring-blue-400' : ''}"
								style="left: {el.x * SCALE}px; top: {el.y * SCALE}px; width: {el.width *
									SCALE}px; height: {el.height * SCALE}px;"
								onpointerdown={(e) => startDrag(e, el)}
							>
								<img
									src={signatureUrl(el)}
									alt="Signature"
									class="pointer-events-none h-full w-full select-none"
									draggable="false"
								/>
								{#if selectedId === el.id}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<span
										class="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-blue-500"
										onpointerdown={(e) => startResize(e, el)}
									></span>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/each}
		</div>
	</div>

	{#if showSignaturePad}
		<SignaturePad onuse={onSignatureDrawn} oncancel={() => (showSignaturePad = false)} />
	{/if}
</div>
