<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { DrawKind, FieldKind } from './constants';
	import { NAMED_PAGE_SIZES } from './constants';

	let { editor, onDrawSignature }: { editor: EditorState; onDrawSignature: () => void } = $props();

	let fieldMenuOpen = $state(false);
	let docMenuOpen = $state(false);

	async function onMergeChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await editor.appendPdf(file);
		input.value = '';
		docMenuOpen = false;
	}

	function applyPageSize(size: [number, number], landscape: boolean) {
		const [w, h] = size;
		const dims: [number, number] = landscape ? [Math.max(w, h), Math.min(w, h)] : [w, h];
		editor.setAllPageSizes(dims);
		docMenuOpen = false;
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
			? 'shrink-0 rounded bg-blue-600 px-2.5 py-1.5 text-sm font-medium text-white'
			: 'shrink-0 rounded px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100';
	}

	const menuItem = 'block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100';
</script>

<header class="flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-2">
	<!-- Left: File (icons) -->
	<div class="flex shrink-0 items-center gap-1">
		<label
			class="flex cursor-pointer items-center gap-1.5 rounded bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
			title="Upload a PDF"
		>
			<!-- upload icon -->
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
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			{editor.loadingPdf ? 'Loading…' : 'Upload'}
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
				class="shrink-0 rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
			>
				New blank
			</button>
		{/if}
	</div>

	<!-- Center: Insert tools. Scrolls internally on narrow screens so the right
	     zone (Export) is never pushed off-screen. -->
	<div class="flex min-w-0 flex-1 items-center gap-3">
		<div class="flex items-center gap-1 overflow-x-auto rounded-lg border border-gray-200 p-1">
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
				class="shrink-0 cursor-pointer rounded px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
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
		<div class="relative shrink-0">
			<button
				class={toolClass(editor.activeFieldKind !== null) + ' border border-gray-200'}
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
							class="{menuItem} {editor.activeFieldKind === f.kind
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

	<!-- Right: document menu + export (pinned; never scrolls off) -->
	<div class="flex shrink-0 items-center gap-2">
		<div class="relative">
			<button
				class="rounded px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
				aria-haspopup="menu"
				aria-expanded={docMenuOpen}
				onclick={() => (docMenuOpen = !docMenuOpen)}
			>
				Document ▾
			</button>
			{#if docMenuOpen}
				<div
					class="absolute top-full right-0 z-30 mt-1 max-h-96 w-52 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
					role="menu"
				>
					<label class="{menuItem} block cursor-pointer">
						Merge / append PDF…
						<input
							type="file"
							accept="application/pdf,.pdf"
							class="hidden"
							disabled={editor.loadingPdf}
							onchange={onMergeChange}
						/>
					</label>
					<button
						class={menuItem}
						role="menuitem"
						onclick={() => {
							editor.docPropsModalOpen = true;
							docMenuOpen = false;
						}}
					>
						Properties…
					</button>
					<button
						class={menuItem}
						role="menuitem"
						onclick={() => {
							editor.outlineEditorOpen = true;
							docMenuOpen = false;
						}}
					>
						Outline / bookmarks…
					</button>
					{#if editor.pageOps.length > 0}
						<div class="my-1 border-t border-gray-100"></div>
						<p class="px-3 py-1 text-xs font-medium tracking-wide text-gray-400 uppercase">
							Page size
						</p>
						{#each NAMED_PAGE_SIZES as s (s.label)}
							<button class={menuItem} role="menuitem" onclick={() => applyPageSize(s.size, false)}>
								{s.label} portrait
							</button>
							<button class={menuItem} role="menuitem" onclick={() => applyPageSize(s.size, true)}>
								{s.label} landscape
							</button>
						{/each}
					{/if}
				</div>
			{/if}
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
