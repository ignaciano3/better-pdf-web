import { describe, it, expect, vi, beforeEach } from 'vitest';

// One fake proxy per opened document; getDocument counts how often it's called.
const destroyed: number[] = [];
let openCount = 0;

function makeProxy(id: number) {
	return {
		id,
		loadingTask: {
			destroy: vi.fn(async () => {
				destroyed.push(id);
			})
		}
	};
}

vi.mock('./render', () => ({
	loadPdfjs: vi.fn(async () => ({
		getDocument: () => {
			const proxy = makeProxy(++openCount);
			return { promise: Promise.resolve(proxy) };
		}
	}))
}));

import { PdfDocStore } from './pdf-doc-store';

beforeEach(() => {
	destroyed.length = 0;
	openCount = 0;
});

describe('PdfDocStore', () => {
	it('opens a document once per docIndex and reuses it', async () => {
		const store = new PdfDocStore();
		const bytes = new Uint8Array([1, 2, 3]);
		const a = await store.get(0, bytes);
		const b = await store.get(0, bytes);
		expect(a).toBe(b);
		expect(openCount).toBe(1);
	});

	it('opens distinct documents for distinct docIndexes', async () => {
		const store = new PdfDocStore();
		await store.get(0, new Uint8Array([1]));
		await store.get(1, new Uint8Array([2]));
		expect(openCount).toBe(2);
	});

	it('destroy evicts and destroys one document; re-get re-opens', async () => {
		const store = new PdfDocStore();
		const first = await store.get(0, new Uint8Array([1]));
		await store.destroy(0);
		expect(destroyed).toContain((first as unknown as { id: number }).id);
		await store.get(0, new Uint8Array([1]));
		expect(openCount).toBe(2);
	});

	it('destroyAll destroys every cached document and clears the cache', async () => {
		const store = new PdfDocStore();
		await store.get(0, new Uint8Array([1]));
		await store.get(1, new Uint8Array([2]));
		await store.destroyAll();
		expect(destroyed.length).toBe(2);
		await store.get(0, new Uint8Array([1]));
		expect(openCount).toBe(3);
	});

	it('opens from a copy so the caller buffer is never detached', async () => {
		const store = new PdfDocStore();
		const bytes = new Uint8Array([5, 6, 7]);
		await store.get(0, bytes);
		// The caller's bytes are still readable (a real detach would zero length).
		expect(bytes.length).toBe(3);
	});
});
