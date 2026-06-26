<script lang="ts">
	import type { EditorState } from './editor.svelte';
	import type { RenderedPage } from '$lib/pdf/render';
	import { SCALE } from './constants';

	let {
		editor,
		docIndex,
		sourceIndex,
		render,
		rotation,
		box
	}: {
		editor: EditorState;
		docIndex: number;
		sourceIndex: number;
		render: RenderedPage;
		rotation: number;
		box: { width: number; height: number };
	} = $props();

	let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
	// True once a crisp canvas has painted; fades out the PNG placeholder.
	let sharp = $state(false);
	// Set by the IntersectionObserver; off-screen pages don't rasterise.
	let visible = $state(false);

	function dpr(): number {
		return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
	}

	// Latest-wins guard: only the most recently requested render may flip `sharp`
	// and keep its bitmap. An older RenderTask that resolves late is ignored.
	let seq = 0;
	let currentTask: { cancel(): void } | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	async function rerender(targetZoom: number) {
		const canvas = canvasEl;
		if (!canvas || !visible) return;
		if (!editor.sources[docIndex]) return;
		const mine = ++seq;
		// Cancel any in-flight render before starting a new one.
		currentTask?.cancel();
		currentTask = null;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let page: any = null;
		try {
			const doc = await editor.getPdfDoc(docIndex);
			if (mine !== seq) return;
			page = await doc.getPage(sourceIndex + 1);
			if (mine !== seq) return;

			const scale = SCALE * targetZoom * dpr();
			const viewport = page.getViewport({ scale });
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);

			const task = page.render({ canvas, viewport });
			currentTask = task;
			await task.promise;
			if (mine !== seq) return;
			sharp = true;
		} catch {
			// Cancelled or failed: keep the PNG placeholder visible.
		} finally {
			page?.cleanup();
			if (mine === seq) currentTask = null;
		}
	}

	// Re-rasterise when zoom settles (debounced) or when the page scrolls in.
	$effect(() => {
		const z = editor.zoom;
		if (!visible) return;
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => void rerender(z), 150);
		return () => clearTimeout(debounceTimer);
	});

	// Render only what's on screen.
	$effect(() => {
		const el = canvasEl;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) visible = e.isIntersecting;
			},
			{ rootMargin: '200px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	// A new source page (reorder/delete) invalidates the current bitmap.
	$effect(() => {
		// Touch the identifying inputs so the placeholder shows again on change.
		void docIndex;
		void sourceIndex;
		void render.dataUrl;
		sharp = false;
	});

	const displayStyle = $derived(
		`width: ${box.width * SCALE}px; height: ${box.height * SCALE}px; ` +
			`transform: translate(-50%, -50%) rotate(${rotation}deg);`
	);
</script>

<!-- PNG placeholder: instant, soft; sits under the sharp canvas until it paints. -->
<img
	src={render.dataUrl}
	alt={`Page ${sourceIndex + 1}`}
	class="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none transition-opacity duration-150"
	style={`${displayStyle} opacity: ${sharp ? 0 : 1};`}
	draggable="false"
/>
<!-- Sharp re-rasterised layer. Same display box + rotation as the placeholder;
     only its backing store grows with zoom*dpr. -->
<canvas
	bind:this={canvasEl}
	class="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none transition-opacity duration-150"
	style={`${displayStyle} opacity: ${sharp ? 1 : 0};`}
></canvas>
