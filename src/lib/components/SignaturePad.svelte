<script lang="ts">
	// Freehand signature pad. The user draws with a pointer; on "Use", the
	// drawn strokes are exported as a transparent-background PNG (Uint8Array)
	// trimmed to the ink's bounding box, plus its aspect ratio.

	interface Props {
		/** Called with the trimmed PNG bytes and its natural aspect ratio (w/h). */
		onuse: (png: Uint8Array, aspect: number) => void;
		oncancel: () => void;
	}

	const { onuse, oncancel }: Props = $props();

	// Logical drawing space. All pointer math, stroke coords, and the ink bounding
	// box are kept in these units.
	const WIDTH = 480;
	const HEIGHT = 200;
	// Supersample the backing store so the exported PNG has enough pixels to stay
	// sharp when placed at ~180pt (~2.5in) in the PDF. At 1x the ≤480px capture
	// gets upscaled and looks blurry; 3x gives a print-quality raster.
	const OVERSAMPLE = 3;

	let canvas: HTMLCanvasElement;
	let drawing = false;
	let hasInk = $state(false);
	// Ink bounding box in canvas pixels, grown as the user draws.
	let minX = WIDTH;
	let minY = HEIGHT;
	let maxX = 0;
	let maxY = 0;

	function ctx(): CanvasRenderingContext2D {
		const c = canvas.getContext('2d');
		if (!c) throw new Error('2D canvas context unavailable');
		return c;
	}

	// Size the backing store to the oversampled resolution and scale the context so
	// every draw call can keep working in logical WIDTH×HEIGHT units. Runs once the
	// canvas is bound; setting width/height also resets the transform, so scale after.
	$effect(() => {
		if (!canvas) return;
		canvas.width = WIDTH * OVERSAMPLE;
		canvas.height = HEIGHT * OVERSAMPLE;
		ctx().scale(OVERSAMPLE, OVERSAMPLE);
	});

	function pos(e: PointerEvent): { x: number; y: number } {
		const rect = canvas.getBoundingClientRect();
		return {
			x: ((e.clientX - rect.left) / rect.width) * WIDTH,
			y: ((e.clientY - rect.top) / rect.height) * HEIGHT
		};
	}

	function grow(x: number, y: number) {
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}

	function start(e: PointerEvent) {
		drawing = true;
		const c = ctx();
		c.lineWidth = 2.5;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.strokeStyle = '#111827';
		const { x, y } = pos(e);
		c.beginPath();
		c.moveTo(x, y);
		grow(x, y);
		canvas.setPointerCapture(e.pointerId);
	}

	function move(e: PointerEvent) {
		if (!drawing) return;
		const c = ctx();
		const { x, y } = pos(e);
		c.lineTo(x, y);
		c.stroke();
		grow(x, y);
		hasInk = true;
	}

	function end() {
		drawing = false;
	}

	function clear() {
		ctx().clearRect(0, 0, WIDTH, HEIGHT);
		hasInk = false;
		minX = WIDTH;
		minY = HEIGHT;
		maxX = 0;
		maxY = 0;
	}

	async function use() {
		if (!hasInk) return;
		// Trim to ink bounds with a small padding so the saved PNG is tight.
		const pad = 8;
		const x0 = Math.max(0, Math.floor(minX - pad));
		const y0 = Math.max(0, Math.floor(minY - pad));
		const x1 = Math.min(WIDTH, Math.ceil(maxX + pad));
		const y1 = Math.min(HEIGHT, Math.ceil(maxY + pad));
		const w = Math.max(1, x1 - x0);
		const h = Math.max(1, y1 - y0);

		// Emit at the full backing resolution: the bbox is in logical units, but the
		// canvas pixels are OVERSAMPLE× denser, so read/write in device pixels.
		const out = document.createElement('canvas');
		out.width = w * OVERSAMPLE;
		out.height = h * OVERSAMPLE;
		const oc = out.getContext('2d');
		if (!oc) throw new Error('2D canvas context unavailable');
		// Transparent background is preserved: we never fillRect, just copy ink.
		oc.drawImage(
			canvas,
			x0 * OVERSAMPLE,
			y0 * OVERSAMPLE,
			w * OVERSAMPLE,
			h * OVERSAMPLE,
			0,
			0,
			w * OVERSAMPLE,
			h * OVERSAMPLE
		);

		const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
		if (!blob) return;
		const bytes = new Uint8Array(await blob.arrayBuffer());
		onuse(bytes, w / h);
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
	<div class="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl">
		<h2 class="mb-2 text-sm font-semibold text-gray-800">Draw your signature</h2>
		<canvas
			bind:this={canvas}
			class="w-full touch-none rounded border border-dashed border-gray-300 bg-gray-50"
			style="aspect-ratio: {WIDTH} / {HEIGHT};"
			onpointerdown={start}
			onpointermove={move}
			onpointerup={end}
			onpointerleave={end}
		></canvas>
		<div class="mt-3 flex items-center justify-end gap-2">
			<button
				onclick={clear}
				class="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
			>
				Clear
			</button>
			<button
				onclick={oncancel}
				class="rounded bg-gray-50 px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
			>
				Cancel
			</button>
			<button
				onclick={use}
				disabled={!hasInk}
				class="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
			>
				Use signature
			</button>
		</div>
	</div>
</div>
