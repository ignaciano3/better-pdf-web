<script lang="ts">
	import { exportPdf } from './export.remote';
	import type { EditState, TextElement } from '$lib/pdf/types';

	// A4 in PDF points; rendered at SCALE px per point.
	const PAGE: [number, number] = [595.28, 841.89];
	const SCALE = 0.8;

	let elements = $state<TextElement[]>([]);
	let selectedId = $state<string | null>(null);
	let exporting = $state(false);
	let nextId = 0;

	function addTextAt(clientX: number, clientY: number, pageEl: HTMLElement) {
		const rect = pageEl.getBoundingClientRect();
		const x = (clientX - rect.left) / SCALE;
		const y = (clientY - rect.top) / SCALE;
		const el: TextElement = {
			type: 'text',
			id: `t${nextId++}`,
			text: 'New text',
			x,
			y,
			size: 16
		};
		elements.push(el);
		selectedId = el.id;
	}

	function onPageClick(event: MouseEvent) {
		// Only add when clicking the bare page, not an existing element.
		if (event.target === event.currentTarget) {
			addTextAt(event.clientX, event.clientY, event.currentTarget as HTMLElement);
		}
	}

	function startDrag(event: PointerEvent, el: TextElement) {
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

	function removeSelected() {
		if (selectedId) {
			elements = elements.filter((e) => e.id !== selectedId);
			selectedId = null;
		}
	}

	async function doExport() {
		exporting = true;
		try {
			const state: EditState = { pageSize: PAGE, elements: $state.snapshot(elements) };
			const bytes = await exportPdf(state);
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
		} finally {
			exporting = false;
		}
	}

	const selected = $derived(elements.find((e) => e.id === selectedId) ?? null);
</script>

<div class="flex h-screen flex-col bg-gray-100">
	<header class="flex items-center gap-3 border-b bg-white px-4 py-2 shadow-sm">
		<h1 class="font-semibold">better-pdf editor</h1>
		<span class="text-sm text-gray-500">Click the page to add text. Drag to move.</span>
		<div class="ml-auto flex items-center gap-2">
			{#if selected}
				<label class="flex items-center gap-1 text-sm">
					Size
					<input
						type="number"
						min="6"
						max="200"
						bind:value={selected.size}
						class="w-16 rounded border px-1 py-0.5"
					/>
				</label>
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

	<div class="flex-1 overflow-auto p-8">
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="relative mx-auto bg-white shadow-lg"
			style="width: {PAGE[0] * SCALE}px; height: {PAGE[1] * SCALE}px;"
			onclick={onPageClick}
		>
			{#each elements as el (el.id)}
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
			{/each}
		</div>
	</div>
</div>
