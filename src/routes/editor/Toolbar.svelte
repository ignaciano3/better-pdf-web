<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { DrawKind, FieldKind } from './constants';
	import { NAMED_PAGE_SIZES } from './constants';

	let { editor, onDrawSignature }: { editor: EditorState; onDrawSignature: () => void } = $props();

	let fieldMenuOpen = $state(false);
	let sizeMenuOpen = $state(false);

	async function onMergeChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.appendPdf(file);
		input.value = '';
	}

	function applyPageSize(size: [number, number], landscape: boolean) {
		const [w, h] = size;
		const dims: [number, number] = landscape ? [Math.max(w, h), Math.min(w, h)] : [w, h];
		editor.setAllPageSizes(dims);
		sizeMenuOpen = false;
	}

	const fieldTools: { kind: FieldKind; label: string }[] = [
		{ kind: 'text', label: 'Text field' },
		{ kind: 'checkbox', label: 'Checkbox' },
		{ kind: 'radio', label: 'Radio group' },
		{ kind: 'dropdown', label: 'Dropdown' },
		{ kind: 'combo', label: 'Combo box' },
		{ kind: 'listbox', label: 'List box' },
		{ kind: 'signature', label: 'Signature field' }
	];

	function pickField(kind: FieldKind) {
		editor.setTool({ type: 'field', kind });
		fieldMenuOpen = false;
	}

	async function onPdfChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.loadPdf(file);
		input.value = '';
	}

	async function onImageUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const pending = await editor.readRaster(file);
			if (pending) {
				editor.pendingImage = pending;
				editor.setTool({ type: 'draw', kind: 'image' });
			}
		}
		input.value = '';
	}

	async function onSignatureUpload(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const pending = await editor.readRaster(file);
			if (pending) {
				editor.pendingSignature = pending;
				editor.setTool({ type: 'draw', kind: 'signature' });
			}
		}
		input.value = '';
	}

	const drawTools: { kind: DrawKind; label: string }[] = [
		{ kind: 'text', label: 'Text' },
		{ kind: 'line', label: 'Line' },
		{ kind: 'rectangle', label: 'Rectangle' },
		{ kind: 'ellipse', label: 'Ellipse' },
		{ kind: 'path', label: 'Draw' },
		{ kind: 'polygon', label: 'Polygon' },
		{ kind: 'link', label: 'Link' }
	];

	function toolClass(active: boolean): string {
		return active
			? 'rounded bg-blue-600 px-2.5 py-1.5 text-sm font-medium text-white'
			: 'rounded px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100';
	}
</script>

<header class="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-2">
	<!-- Left: File -->
	<div class="flex items-center gap-2">
		<span class="text-sm font-semibold text-gray-900">better-pdf</span>
		<label
			class="cursor-pointer rounded bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
		>
			{editor.loadingPdf ? 'Loading…' : 'Upload PDF'}
			<input
				type="file"
				accept="application/pdf,.pdf"
				class="hidden"
				disabled={editor.loadingPdf}
				onchange={onPdfChange}
			/>
		</label>
		{#if editor.sourceBytes}
			<button
				onclick={() => editor.clearSource()}
				class="rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
			>
				New blank
			</button>
		{/if}
	</div>

	<!-- Center: Insert tools — Drawings | Form fields (fields land in PR2) -->
	<div class="mx-auto flex items-center gap-3">
		<div class="flex items-center gap-1 rounded-lg border border-gray-200 p-1">
			<button class={toolClass(editor.tool.type === 'select')} onclick={() => editor.resetTool()}>
				Select
			</button>
			{#each drawTools as t (t.kind)}
				<button
					class={toolClass(editor.activeDrawKind === t.kind)}
					onclick={() => editor.setTool({ type: 'draw', kind: t.kind })}
				>
					{t.label}
				</button>
			{/each}
			<button class={toolClass(editor.activeDrawKind === 'signature')} onclick={onDrawSignature}>
				Signature
			</button>
			<label class={toolClass(editor.activeDrawKind === 'image') + ' cursor-pointer'}>
				Image
				<input
					type="file"
					accept="image/png,image/jpeg,.png,.jpg,.jpeg"
					class="hidden"
					onchange={onImageUpload}
				/>
			</label>
			<label
				class="cursor-pointer rounded px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
			>
				Upload sig
				<input
					type="file"
					accept="image/png,image/jpeg,.png,.jpg,.jpeg"
					class="hidden"
					onchange={onSignatureUpload}
				/>
			</label>
		</div>

		<!-- Form fields — a separate group from the drawing tools. -->
		<div class="relative flex items-center gap-1 rounded-lg border border-gray-200 p-1">
			<button
				class={toolClass(editor.activeFieldKind !== null)}
				aria-haspopup="menu"
				aria-expanded={fieldMenuOpen}
				onclick={() => (fieldMenuOpen = !fieldMenuOpen)}
			>
				Field ▾
			</button>
			{#if fieldMenuOpen}
				<div
					class="absolute top-full left-0 z-30 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
					role="menu"
				>
					{#each fieldTools as f (f.kind)}
						<button
							class="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 {editor.activeFieldKind ===
							f.kind
								? 'font-semibold text-blue-600'
								: ''}"
							role="menuitem"
							onclick={() => pickField(f.kind)}
						>
							{f.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Right: document controls + zoom + export -->
	<div class="flex items-center gap-2">
		<!-- Merge another PDF -->
		<label
			class="cursor-pointer rounded px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
			title="Merge / append another PDF"
		>
			Merge PDF
			<input
				type="file"
				accept="application/pdf,.pdf"
				class="hidden"
				disabled={editor.loadingPdf}
				onchange={onMergeChange}
			/>
		</label>

		<!-- Page size -->
		{#if editor.pageOps.length > 0}
			<div class="relative">
				<button
					class="rounded px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
					aria-haspopup="menu"
					aria-expanded={sizeMenuOpen}
					onclick={() => (sizeMenuOpen = !sizeMenuOpen)}
				>
					Page size ▾
				</button>
				{#if sizeMenuOpen}
					<div
						class="absolute top-full right-0 z-30 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
						role="menu"
					>
						{#each NAMED_PAGE_SIZES as s (s.label)}
							<button
								class="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
								role="menuitem"
								onclick={() => applyPageSize(s.size, false)}
							>
								{s.label} portrait
							</button>
							<button
								class="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
								role="menuitem"
								onclick={() => applyPageSize(s.size, true)}
							>
								{s.label} landscape
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Document properties + outline -->
		<button
			class="rounded px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
			onclick={() => (editor.docPropsModalOpen = true)}
		>
			Properties
		</button>
		<button
			class="rounded px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
			onclick={() => (editor.outlineEditorOpen = true)}
		>
			Outline
		</button>

		<!-- Zoom -->
		<div class="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5">
			<button
				class="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
				title="Zoom out"
				onclick={() => editor.zoomOut()}>−</button
			>
			<button
				class="w-12 rounded px-1 py-1 text-center text-xs text-gray-700 hover:bg-gray-100"
				title="Reset zoom"
				onclick={() => editor.resetZoom()}>{Math.round(editor.zoom * 100)}%</button
			>
			<button
				class="rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
				title="Zoom in"
				onclick={() => editor.zoomIn()}>+</button
			>
			<button
				class="rounded px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
				title="Fit to width"
				onclick={() => editor.fitToWidth()}>Fit</button
			>
		</div>

		<button
			onclick={() => editor.export()}
			disabled={editor.exporting}
			class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
		>
			{editor.exporting ? 'Exporting…' : 'Export PDF'}
		</button>
	</div>
</header>
