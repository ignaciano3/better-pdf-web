# Client-side PDF processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move PDF field-extraction and export/build fully into the browser so document bytes never leave the device, while preserving the freemium funnel via a metadata-only server "allowance" gate.

**Architecture:** The browser already renders/edits with `pdfjs-dist`. We relocate the two byte-carrying server operations — `buildPdf` (export) and AcroForm field extraction — into the client using `@ignaciano3/better-pdf`'s browser (WASM) build. The old `exportPdf`/`extractFields` remote functions are deleted. A new `checkExportAllowance` remote command keeps the existing rate-limit logic but receives only `{ fingerprint }` (no bytes); a new `reportExportError` command records unexpected build failures as metadata only.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), TypeScript, Vite 8, `@ignaciano3/better-pdf` (WASM `--target web`), Drizzle + Postgres, Vitest (client=jsdom+browser-condition / server=node projects), Playwright e2e. Package manager: **bun**.

## Global Constraints

- Use **bun**, never npm/pnpm (`CLAUDE.md`).
- **No document bytes may be sent to the server** — the entire point. Only `{ fingerprint }` (usage gate) and coarse error metadata (message/stack/counts) may leave the browser.
- The rate-limit denial contract is unchanged: HTTP `429` with a JSON body `{ reason: 'rate_limited', limit, window, upgradeUrl }`. `UpgradeUrl` = `/pricing`; caps: anonymous 2/hr, free 5/hr, pro/root unlimited; window = 1 hour (`WINDOW_MS`).
- The `exportError` table has no columns for doc shape — fold shape counts into the `message` string; do **not** add a migration.
- Prettier only touches files you edit (repo is not prettier-clean); do not run repo-wide `format`.
- Neutral family is slate only; do not introduce `gray-*`/`zinc-*` (DESIGN.md).
- Record the usage event at the allowance check (before the client build) — a rare failed build still consumes quota (parity with today).

---

## File Structure

- `src/routes/editor/extract-fields.ts` — MODIFY: host the shared `ExtractFieldsResult` interface (moved out of the deleted remote) next to `mapFields`.
- `src/routes/editor/extract-fields-client.ts` — CREATE: `extractFieldsFromBytes(bytes)` running better-pdf in the browser.
- `src/routes/editor/extractFields.remote.ts` — DELETE.
- `src/routes/editor/export-validate.ts` — MODIFY: split out `validateExportState(state)` for client-side use.
- `src/routes/editor/gate.remote.ts` — CREATE: `checkExportAllowance` + `reportExportError` commands.
- `src/routes/editor/export.remote.ts` — DELETE.
- `src/routes/editor/export-error-log.ts` — MODIFY: `recordExportError(details, tier, actor)` (client-classified; no `PdfBuildError` logic).
- `src/routes/editor/editor.svelte.ts` — MODIFY: client export flow + WASM warm-up method; drop old remote imports.
- `src/routes/editor/+page.svelte` — MODIFY: warm the WASM engine on idle after mount.
- `vite.config.ts` — MODIFY (only if verification requires): WASM asset serving.
- `e2e/export.spec.ts` — MODIFY: assert no PDF bytes leave the browser.
- `src/routes/+page.svelte`, `PRODUCT.md` — MODIFY: privacy positioning copy.

---

### Task 1: Client field extraction (browser WASM)

Move field extraction off the server. Create a browser module, rewire the editor's two call sites, delete the remote. Leaves the build green.

**Files:**
- Modify: `src/routes/editor/extract-fields.ts` (add `ExtractFieldsResult` interface)
- Create: `src/routes/editor/extract-fields-client.ts`
- Test: `src/routes/editor/extract-fields-client.svelte.test.ts` (named `.svelte.test.ts` so Vitest's **client** project runs it under the `browser` resolve condition + jsdom)
- Modify: `src/routes/editor/editor.svelte.ts` (call sites ~1237, ~1324; import line 25)
- Delete: `src/routes/editor/extractFields.remote.ts`

**Interfaces:**
- Consumes: `mapFields(fields: FieldInfoLike[], pageHeights: number[]): FieldElement[]` and `FieldInfoLike` from `./extract-fields`.
- Produces: `ExtractFieldsResult` (in `./extract-fields`) and `extractFieldsFromBytes(bytes: Uint8Array): Promise<ExtractFieldsResult>` (in `./extract-fields-client`).

- [ ] **Step 1: Move the result interface into the shared helper**

In `src/routes/editor/extract-fields.ts`, add near the top (after imports):

```typescript
/** Result of reading the AcroForm fields out of an uploaded PDF. */
export interface ExtractFieldsResult {
	/** Detected fields as editor elements (top-left coords). */
	fields: FieldElement[];
	/** Per-page heights in PDF points, indexed by page. */
	pageHeights: number[];
	/** Every raw AcroForm field name in the document, including fields the
	 *  mapper skips (hidden widgets, pushbuttons, unknown types). Drives
	 *  editor-side collision validation for the incremental export. */
	allNames: string[];
}
```

(`FieldElement` is already imported by this file for `mapFields`.)

- [ ] **Step 2: Write the failing test**

Create `src/routes/editor/extract-fields-client.svelte.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock the browser WASM package: never load real WASM in jsdom. `load` returns a
// fake document whose form yields one text field on a single 800pt-high page.
const getFields = vi.fn(() => [{ name: 'person.name', type: 'text', page: 0, rect: [100, 700, 300, 720] }]);
vi.mock('@ignaciano3/better-pdf', () => ({
	PdfDocument: {
		load: vi.fn(async () => ({
			getPages: () => [{ height: 800 }],
			getForm: () => ({ getFields })
		}))
	}
}));

import { extractFieldsFromBytes } from './extract-fields-client';

describe('extractFieldsFromBytes', () => {
	it('maps AcroForm fields, page heights, and raw names', async () => {
		const res = await extractFieldsFromBytes(new Uint8Array([1, 2, 3]));
		expect(res.pageHeights).toEqual([800]);
		expect(res.allNames).toEqual(['person.name']);
		expect(res.fields.length).toBe(1);
	});

	it('returns empty results on empty input', async () => {
		const res = await extractFieldsFromBytes(new Uint8Array());
		expect(res).toEqual({ fields: [], pageHeights: [], allNames: [] });
	});

	it('returns empty results when load throws (corrupt/encrypted/XFA)', async () => {
		const { PdfDocument } = await import('@ignaciano3/better-pdf');
		vi.mocked(PdfDocument.load).mockRejectedValueOnce(new Error('encrypted'));
		const res = await extractFieldsFromBytes(new Uint8Array([9]));
		expect(res).toEqual({ fields: [], pageHeights: [], allNames: [] });
	});
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test:unit -- --run --project client src/routes/editor/extract-fields-client.svelte.test.ts`
Expected: FAIL — cannot resolve `./extract-fields-client`.

- [ ] **Step 4: Write the client module**

Create `src/routes/editor/extract-fields-client.ts`:

```typescript
import { PdfDocument } from '@ignaciano3/better-pdf';
import type { FieldElement } from '$lib/pdf/types';
import { mapFields, type FieldInfoLike, type ExtractFieldsResult } from './extract-fields';

export type { ExtractFieldsResult };

/**
 * Read AcroForm fields from uploaded PDF bytes, entirely in the browser (the
 * WASM build initializes on first `PdfDocument.load`). Bytes never leave the
 * device. On any failure (corrupt / encrypted / XFA) returns empty results so
 * the editor still opens for stamping — no fields surfaced.
 */
export async function extractFieldsFromBytes(bytes: Uint8Array): Promise<ExtractFieldsResult> {
	if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
		return { fields: [], pageHeights: [], allNames: [] };
	}
	try {
		const doc = await PdfDocument.load(bytes);
		const pageHeights = doc.getPages().map((p) => p.height);
		const infos = doc.getForm().getFields() as unknown as FieldInfoLike[];
		const fields = mapFields(infos, pageHeights) as FieldElement[];
		const allNames = infos.map((i) => i.name);
		return { fields, pageHeights, allNames };
	} catch (error) {
		console.error('Error extracting fields:', error);
		return { fields: [], pageHeights: [], allNames: [] };
	}
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run test:unit -- --run --project client src/routes/editor/extract-fields-client.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Rewire the editor's two extraction call sites**

In `src/routes/editor/editor.svelte.ts`, delete the import on line 25 (`import { extractFields } from './extractFields.remote';`) and add near the other local imports:

```typescript
import { extractFieldsFromBytes } from './extract-fields-client';
```

At the first call site (currently `const res = await extractFields({ bytes: exportCopy.slice() });` inside `loadPdf`), replace with:

```typescript
					const res = await extractFieldsFromBytes(exportCopy.slice());
```

At the second call site (same expression inside `appendPdf`), replace identically:

```typescript
					const res = await extractFieldsFromBytes(exportCopy.slice());
```

Also update the stale comment `// Detect AcroForm fields (D1, server-side).` to `// Detect AcroForm fields (client-side WASM; bytes never leave the browser).`

- [ ] **Step 7: Delete the remote and run the editor + extraction tests**

```bash
rm src/routes/editor/extractFields.remote.ts
```

The editor test mocks `./extractFields.remote`; remove that now-dangling mock. In `src/routes/editor/editor.svelte.test.ts` delete line 7 (`vi.mock('./extractFields.remote', ...)`) and add a mock for the new module near the other `vi.mock` calls:

```typescript
vi.mock('./extract-fields-client', () => ({ extractFieldsFromBytes: vi.fn(async () => ({ fields: [], pageHeights: [], allNames: [] })) }));
```

Run: `bun run test:unit -- --run --project client src/routes/editor/`
Expected: PASS (editor + extraction client tests green).

- [ ] **Step 8: Commit**

```bash
git add src/routes/editor/extract-fields.ts src/routes/editor/extract-fields-client.ts src/routes/editor/extract-fields-client.svelte.test.ts src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts
git rm src/routes/editor/extractFields.remote.ts
git commit -m "feat(editor): extract AcroForm fields client-side (bytes stay local)"
```

---

### Task 2: Split export validation for client use

`validateExportInput` bundled fingerprint + state validation for the server. The client needs state-only validation before `buildPdf`. Extract `validateExportState`; keep `validateExportInput` delegating so existing tests stay green.

**Files:**
- Modify: `src/routes/editor/export-validate.ts:300-415`
- Test: `src/routes/editor/export-validate.test.ts` (add a case)

**Interfaces:**
- Produces: `validateExportState(state: EditState): void` (throws SvelteKit `error()` 413/422 on violation). `validateExportInput` retained: validates fingerprint, then calls `validateExportState`.

- [ ] **Step 1: Write the failing test**

Add to `src/routes/editor/export-validate.test.ts` (import `validateExportState` alongside the existing import):

```typescript
import { validateExportState } from './export-validate';

describe('validateExportState', () => {
	it('accepts a minimal valid state', () => {
		expect(() => validateExportState({ pageSize: [612, 792], elements: [] })).not.toThrow();
	});
	it('rejects a bad page size with a 422', () => {
		expect(() => validateExportState({ pageSize: [0, 0], elements: [] })).toThrowError();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit -- --run --project server src/routes/editor/export-validate.test.ts`
Expected: FAIL — `validateExportState` is not exported.

- [ ] **Step 3: Extract the state validator**

In `src/routes/editor/export-validate.ts`, change the header comment block above the limits from "the export endpoint" to "the client build path (and any server caller)". Then replace the single `validateExportInput` function (lines ~300-415) with the split below — the body is the current state-validation logic moved verbatim into `validateExportState`, and `validateExportInput` keeps the fingerprint checks then delegates:

```typescript
/**
 * Validate the edit state (elements, sources, page ops, metadata, fonts,
 * watermark, outline) before it reaches the PDF renderers. Throws a SvelteKit
 * `error()` (413/422) on violation. Runs client-side now that build is local;
 * the caps still bound the WASM parser's input surface.
 */
export function validateExportState(stateInput: unknown): void {
	if (typeof stateInput !== 'object' || stateInput === null) error(422, 'Invalid request body');
	const state = stateInput as Partial<EditState>;

	const size = state.pageSize;
	if (
		!Array.isArray(size) ||
		size.length !== 2 ||
		!size.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)
	) {
		error(422, 'Invalid page size');
	}

	if (!Array.isArray(state.elements)) error(422, 'Invalid elements');
	if (state.elements.length > MAX_ELEMENTS) error(422, 'Too many elements');
	for (const el of state.elements as EditElement[]) {
		validateElement(el);
	}

	if (state.sourceFields !== undefined) {
		if (!Array.isArray(state.sourceFields)) error(422, 'Invalid source fields');
		if (state.sourceFields.length > MAX_ELEMENTS) error(422, 'Too many source fields');
		for (const el of state.sourceFields as EditElement[]) {
			validateElement(el);
		}
	}

	if (state.sourcePdf !== undefined) {
		if (!(state.sourcePdf instanceof Uint8Array)) error(422, 'Invalid source PDF');
		if (state.sourcePdf.byteLength > MAX_SOURCE_PDF_BYTES) error(413, 'Source PDF too large');
	}

	if (state.sources !== undefined) {
		if (!Array.isArray(state.sources)) error(422, 'Invalid sources');
		if (state.sources.length > MAX_SOURCES) error(422, 'Too many source documents');
		let total = 0;
		for (const s of state.sources) {
			if (!(s instanceof Uint8Array)) error(422, 'Invalid source document');
			if (s.byteLength > MAX_SOURCE_PDF_BYTES) error(413, 'Source PDF too large');
			total += s.byteLength;
		}
		if (total > MAX_TOTAL_SOURCE_BYTES) error(413, 'Source documents too large');
	}

	const sourceCount =
		state.sources !== undefined ? state.sources.length : state.sourcePdf !== undefined ? 1 : 0;

	if (state.pageOps !== undefined) {
		if (!Array.isArray(state.pageOps)) error(422, 'Invalid page operations');
		if (state.pageOps.length > MAX_PAGE_OPS) error(422, 'Too many page operations');
		for (const op of state.pageOps as PageOp[]) {
			if (!op || typeof op !== 'object') error(422, 'Invalid page operation');
			if (op.kind === 'source') {
				if (op.docIndex !== undefined) {
					if (!Number.isInteger(op.docIndex) || op.docIndex < 0 || op.docIndex >= sourceCount) {
						error(422, 'Invalid page operation docIndex');
					}
				}
				if (op.size !== undefined) {
					if (
						!Array.isArray(op.size) ||
						op.size.length !== 2 ||
						!op.size.every((n) => isFiniteNumber(n) && n > 0)
					) {
						error(422, 'Invalid page operation size');
					}
				}
			}
		}
	}

	const outputPageCount =
		state.pageOps !== undefined && Array.isArray(state.pageOps) ? state.pageOps.length : undefined;

	if (state.metadata !== undefined) validateMetadata(state.metadata);
	if (state.outline !== undefined) validateOutline(state.outline, outputPageCount);

	if (state.fonts !== undefined) {
		if (!Array.isArray(state.fonts)) error(422, 'Invalid fonts');
		if (state.fonts.length > MAX_FONTS) error(422, 'Too many fonts');
		for (const font of state.fonts) {
			if (!font || typeof font !== 'object') error(422, 'Invalid font asset');
			if (typeof font.id !== 'string' || font.id.length === 0) error(422, 'Invalid font id');
			if (typeof font.name !== 'string') error(422, 'Invalid font name');
			if (!(font.bytes instanceof Uint8Array)) error(422, 'Invalid font bytes');
			if (font.bytes.byteLength > MAX_FONT_BYTES) error(413, 'Font too large');
		}
	}

	if (state.flatten !== undefined && typeof state.flatten !== 'boolean') {
		error(422, 'Invalid flatten flag');
	}
	if (state.objectStreams !== undefined && typeof state.objectStreams !== 'boolean') {
		error(422, 'Invalid objectStreams flag');
	}
	if (state.watermark !== undefined) validateWatermark(state.watermark);
}

/**
 * Wire-shape validator retained for the fingerprint-bearing payloads: validates
 * the fingerprint, then delegates to {@link validateExportState}.
 */
export function validateExportInput(input: unknown): ExportInput {
	if (typeof input !== 'object' || input === null) error(422, 'Invalid request body');
	const body = input as Partial<ExportInput>;

	const fingerprint = body.fingerprint;
	if (typeof fingerprint !== 'string' || fingerprint.length === 0) {
		error(422, 'Invalid fingerprint');
	}
	if (fingerprint.length > MAX_FINGERPRINT_LEN) error(422, 'Fingerprint too large');

	validateExportState(body.state);
	return { state: body.state as EditState, fingerprint };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test:unit -- --run --project server src/routes/editor/export-validate.test.ts`
Expected: PASS (existing cases + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/routes/editor/export-validate.ts src/routes/editor/export-validate.test.ts
git commit -m "refactor(editor): split validateExportState for client-side validation"
```

---

### Task 3: Metadata gate + error-report commands

Create the new remote commands. `checkExportAllowance` reuses the current rate-limit machinery but takes only `{ fingerprint }`. `reportExportError` records unexpected build failures. Refactor `export-error-log.ts` to a client-classified `recordExportError`. Old `export.remote.ts` stays until Task 4, so the build stays green.

**Files:**
- Create: `src/routes/editor/gate.remote.ts`
- Modify: `src/routes/editor/export-error-log.ts`
- Modify: `src/routes/editor/export-error-log.test.ts`

**Interfaces:**
- Consumes: `resolveIdentity`, `resolvePlan`, `decide`, `windowStart`, `WINDOW_MS`, `Tier`, `usageEvent`, `getDb`.
- Produces:
  - `checkExportAllowance(input: { fingerprint: string }): Promise<{ ok: true }>` (remote command; throws 429 on cap)
  - `reportExportError(input: { fingerprint: string; name: string; message: string; stack?: string; pageCount: number; fieldCount: number; stamping: boolean }): Promise<void>` (remote command)
  - `recordExportError(details: ExportErrorDetails, tier: Tier, actor: ExportErrorActor): Promise<void>` (in `export-error-log.ts`)
  - `ExportErrorDetails = { name: string; message: string; stack?: string; pageCount: number; fieldCount: number; stamping: boolean }`

- [ ] **Step 1: Write the failing test for recordExportError**

Replace the body of `src/routes/editor/export-error-log.test.ts`'s `describe` with tests for the new signature (keep the file's existing `vi.mock` of `$lib/server/db` and imports; drop the `PdfBuildError` import and its skip test — classification is now client-side):

```typescript
describe('recordExportError', () => {
	beforeEach(() => insertValues.mockClear());

	it('inserts metadata with doc-shape folded into the message', async () => {
		await recordExportError(
			{ name: 'TypeError', message: 'boom', stack: 'at x', pageCount: 3, fieldCount: 2, stamping: true },
			'free',
			{ userId: 'u1' }
		);
		const row = insertValues.mock.calls.at(-1)?.[0];
		expect(row).toMatchObject({ name: 'TypeError', tierAtTime: 'free', userId: 'u1', stack: 'at x' });
		expect(row.message).toBe('boom [pages=3 fields=2 stamping=true]');
		expect(row.ipHash).toBeUndefined();
	});

	it('records ipHash (not userId) for an anonymous actor', async () => {
		await recordExportError(
			{ name: 'Error', message: 'x', pageCount: 0, fieldCount: 0, stamping: false },
			'anonymous',
			{ ipHash: 'h1' }
		);
		const row = insertValues.mock.calls.at(-1)?.[0];
		expect(row.ipHash).toBe('h1');
		expect(row.userId).toBeUndefined();
	});

	it('swallows a db write failure and never throws', async () => {
		insertValues.mockRejectedValueOnce(new Error('db down'));
		await expect(
			recordExportError({ name: 'Error', message: 'x', pageCount: 0, fieldCount: 0, stamping: false }, 'free', { userId: 'u1' })
		).resolves.toBeUndefined();
	});
});
```

(Match `insertValues`/`recordExportError` to how the existing test spies on the db mock — reuse the file's current mock plumbing; only the assertions and the function name change.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit -- --run --project server src/routes/editor/export-error-log.test.ts`
Expected: FAIL — `recordExportError` not exported.

- [ ] **Step 3: Rewrite export-error-log.ts**

Replace `src/routes/editor/export-error-log.ts` with:

```typescript
import { getDb } from '$lib/server/db';
import { exportError } from '$lib/server/db/schema.app';
import type { Tier } from '$lib/server/rate-limit';

/** Actor behind a failed export, identified like `usageEvent`. */
export type ExportErrorActor = { userId?: string; ipHash?: string };

/** Client-classified failure metadata. Never carries document content. */
export interface ExportErrorDetails {
	name: string;
	message: string;
	stack?: string;
	pageCount: number;
	fieldCount: number;
	stamping: boolean;
}

/**
 * Persist an unexpected client build failure as metadata only. The client has
 * already filtered out expected `PdfBuildError`s (bad input), so anything that
 * reaches here is a genuine bug. Doc shape is folded into `message` (the table
 * has no shape columns). Best-effort: never throws.
 */
export async function recordExportError(
	details: ExportErrorDetails,
	tier: Tier,
	actor: ExportErrorActor
): Promise<void> {
	try {
		const message = `${details.message} [pages=${details.pageCount} fields=${details.fieldCount} stamping=${details.stamping}]`;
		await getDb()
			.insert(exportError)
			.values({
				id: crypto.randomUUID(),
				tierAtTime: tier,
				name: details.name || 'Error',
				message,
				stack: details.stack ?? null,
				...(actor.userId ? { userId: actor.userId } : { ipHash: actor.ipHash })
			});
	} catch {
		// Best-effort: swallow so a logging failure never masks the export error.
	}
}
```

- [ ] **Step 4: Run to verify recordExportError passes**

Run: `bun run test:unit -- --run --project server src/routes/editor/export-error-log.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the gate remote**

Create `src/routes/editor/gate.remote.ts`:

```typescript
import { command, getRequestEvent } from '$app/server';
import { error } from '@sveltejs/kit';
import { and, count, eq, gte, isNull, or } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { usageEvent } from '$lib/server/db/schema.app';
import { resolveIdentity } from '$lib/server/identity';
import { resolvePlan } from '$lib/server/plan';
import { decide, windowStart, WINDOW_MS, type Tier } from '$lib/server/rate-limit';
import { recordExportError } from './export-error-log';

const EXPORT_ACTION = 'export';
const UPGRADE_URL = '/pricing';

/** Count this actor's prior export events in the current window (SQL mirror of
 *  `countsTowardWindow`: own userId events plus anonymous events by ipHash). */
async function countInWindow(
	userId: string | undefined,
	ipHash: string | undefined,
	now: Date
): Promise<number> {
	const db = getDb();
	const since = windowStart(now);
	const anonMatch = and(isNull(usageEvent.userId), eq(usageEvent.ipHash, ipHash!));
	const who = userId ? or(eq(usageEvent.userId, userId), anonMatch) : anonMatch;
	const rows = await db
		.select({ value: count() })
		.from(usageEvent)
		.where(and(eq(usageEvent.action, EXPORT_ACTION), who, gte(usageEvent.createdAt, since)));
	return rows[0]?.value ?? 0;
}

/**
 * Metadata-only export gate. Receives ONLY the fingerprint — no document bytes.
 * Resolves identity → tier, checks the window, and (when allowed) records the
 * usage event before returning. The client then builds the PDF locally. Over
 * the cap returns HTTP 429 with the upsell payload.
 */
export const checkExportAllowance = command(
	'unchecked',
	async (input: unknown): Promise<{ ok: true }> => {
		const fingerprint = (input as { fingerprint?: unknown } | null)?.fingerprint;
		if (typeof fingerprint !== 'string' || fingerprint.length === 0 || fingerprint.length > 256) {
			error(422, 'Invalid fingerprint');
		}
		const event = getRequestEvent();
		const identity = resolveIdentity(event, fingerprint);
		const tier: Tier = identity.kind === 'anon' ? 'anonymous' : await resolvePlan(identity.userId);

		const now = new Date();
		const priorCount = await countInWindow(identity.userId, identity.ipHash, now);
		const verdict = decide(tier, priorCount);
		if (!verdict.allowed) {
			error(
				429,
				JSON.stringify({
					reason: 'rate_limited',
					limit: verdict.limit,
					window: WINDOW_MS,
					upgradeUrl: UPGRADE_URL
				})
			);
		}

		// Record before returning so concurrent calls can't both squeak past.
		await getDb()
			.insert(usageEvent)
			.values({
				id: crypto.randomUUID(),
				action: EXPORT_ACTION,
				tierAtTime: tier,
				createdAt: now,
				...(identity.userId ? { userId: identity.userId } : { ipHash: identity.ipHash })
			});
		return { ok: true };
	}
);

/**
 * Record an unexpected client build failure. Metadata only — the client sends
 * error name/message/stack and coarse doc-shape counts, never document content.
 */
export const reportExportError = command('unchecked', async (input: unknown): Promise<void> => {
	const b = (input ?? {}) as {
		fingerprint?: unknown;
		name?: unknown;
		message?: unknown;
		stack?: unknown;
		pageCount?: unknown;
		fieldCount?: unknown;
		stamping?: unknown;
	};
	const fingerprint = typeof b.fingerprint === 'string' ? b.fingerprint : '';
	const event = getRequestEvent();
	const identity = resolveIdentity(event, fingerprint);
	const tier: Tier = identity.kind === 'anon' ? 'anonymous' : await resolvePlan(identity.userId);
	await recordExportError(
		{
			name: typeof b.name === 'string' ? b.name.slice(0, 256) : 'Error',
			message: typeof b.message === 'string' ? b.message.slice(0, 4096) : String(b.message),
			stack: typeof b.stack === 'string' ? b.stack.slice(0, 8192) : undefined,
			pageCount: typeof b.pageCount === 'number' ? b.pageCount : 0,
			fieldCount: typeof b.fieldCount === 'number' ? b.fieldCount : 0,
			stamping: b.stamping === true
		},
		tier,
		{ userId: identity.userId, ipHash: identity.ipHash }
	);
});
```

- [ ] **Step 6: Typecheck and run the server tests**

Run: `bun run check && bun run test:unit -- --run --project server src/routes/editor/`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/editor/gate.remote.ts src/routes/editor/export-error-log.ts src/routes/editor/export-error-log.test.ts
git commit -m "feat(editor): metadata-only export allowance + error-report commands"
```

---

### Task 4: Rewire the client export flow

Switch `EditorState.export()` to: gate ping → validate → local build → download; classify build failures client-side. Delete `export.remote.ts`. This is the task that makes export fully client-side.

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts` (imports; `export()` ~1523-1569)
- Modify: `src/routes/editor/editor.svelte.test.ts`
- Delete: `src/routes/editor/export.remote.ts`

**Interfaces:**
- Consumes: `checkExportAllowance`, `reportExportError` (`./gate.remote`); `validateExportState` (`./export-validate`); `buildPdf`, `PdfBuildError` (dynamic `import('$lib/pdf/build')`).

- [ ] **Step 1: Write the failing tests**

In `src/routes/editor/editor.svelte.test.ts`: replace `vi.mock('./export.remote', () => ({ exportPdf: vi.fn() }))` with mocks for the gate and the build module, and update the import block:

```typescript
vi.mock('./gate.remote', () => ({
	checkExportAllowance: vi.fn(async () => ({ ok: true })),
	reportExportError: vi.fn(async () => {})
}));
class FakePdfBuildError extends Error {}
const buildPdf = vi.fn(async () => new Uint8Array([37, 80, 68, 70, 45])); // %PDF-
vi.mock('$lib/pdf/build', () => ({ buildPdf, PdfBuildError: FakePdfBuildError }));
```

Update imports at the top of the test to pull the mocked symbols:

```typescript
import { checkExportAllowance, reportExportError } from './gate.remote';
```

Add a describe block (the download uses `<a>.click()`; stub it so no real navigation happens):

```typescript
describe('EditorState.export (client build)', () => {
	beforeEach(() => {
		buildPdf.mockClear();
		vi.mocked(checkExportAllowance).mockClear();
		vi.mocked(reportExportError).mockClear();
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
		globalThis.URL.revokeObjectURL = vi.fn();
	});

	it('gates, builds locally, and downloads when allowed', async () => {
		const e = new EditorState();
		await e.export();
		expect(checkExportAllowance).toHaveBeenCalledTimes(1);
		expect(buildPdf).toHaveBeenCalledTimes(1);
		expect(e.upsell).toBeNull();
		expect(e.errorMessage).toBeNull();
	});

	it('shows the upsell and does NOT build when the gate returns 429', async () => {
		vi.mocked(checkExportAllowance).mockRejectedValueOnce({
			status: 429,
			body: { message: JSON.stringify({ reason: 'rate_limited', limit: 2 }) }
		});
		const e = new EditorState();
		await e.export();
		expect(e.upsell).toEqual({ limit: 2 });
		expect(buildPdf).not.toHaveBeenCalled();
	});

	it('surfaces a PdfBuildError locally and does NOT report it', async () => {
		buildPdf.mockRejectedValueOnce(new FakePdfBuildError('encrypted'));
		const e = new EditorState();
		await e.export();
		expect(e.errorMessage).toContain('encrypted');
		expect(reportExportError).not.toHaveBeenCalled();
	});

	it('reports an unexpected build failure as metadata', async () => {
		buildPdf.mockRejectedValueOnce(new TypeError('undefined is not a function'));
		const e = new EditorState();
		await e.export();
		expect(e.errorMessage).toBeTruthy();
		expect(reportExportError).toHaveBeenCalledTimes(1);
		const arg = vi.mocked(reportExportError).mock.calls[0][0] as { name: string };
		expect(arg.name).toBe('TypeError');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit -- --run --project client src/routes/editor/editor.svelte.test.ts`
Expected: FAIL — `./gate.remote` mock target not imported by source yet / `export()` still calls `exportPdf`.

- [ ] **Step 3: Rewrite the imports and export() method**

In `src/routes/editor/editor.svelte.ts`: delete line 24 (`import { exportPdf } from './export.remote';`). Add near the local imports:

```typescript
import { checkExportAllowance, reportExportError } from './gate.remote';
import { validateExportState } from './export-validate';
```

Replace the `export()` method (the state-assembly block up to `bytes = await exportPdf(...)`) so the gate + local build + classification replace the single remote call. Keep the existing state assembly (lines building `const state: EditState = {...}`) verbatim; change only from the `const bytes = ...` line and the `catch`:

```typescript
			validateExportState(state);
			await checkExportAllowance({ fingerprint: getFingerprint() });

			const { buildPdf, PdfBuildError } = await import('$lib/pdf/build');
			try {
				const bytes = await buildPdf(state);
				downloadPdf(bytes);
			} catch (e) {
				this.errorMessage = exportErrorMessage(e);
				if (!(e instanceof PdfBuildError)) {
					// Genuine bug (not bad input): report metadata only, never bytes.
					const err = e instanceof Error ? e : undefined;
					void reportExportError({
						fingerprint: getFingerprint(),
						name: err?.name ?? 'Error',
						message: err?.message ?? String(e),
						stack: err?.stack,
						pageCount: this.pages.length,
						fieldCount: this.elements.filter((el) => el.type === 'field').length,
						stamping: this.sources.length > 0
					});
				}
			}
		} catch (e) {
			// Gate (429) or validation failure — before any local build ran.
			const upsell = parseUpsell(e);
			if (upsell) {
				this.upsell = upsell;
			} else {
				this.errorMessage = exportErrorMessage(e);
			}
		} finally {
			this.exporting = false;
		}
	}
```

Note the ordering: `validateExportState` and `checkExportAllowance` run inside the outer `try`; a 429 or a validation `error()` lands in the outer `catch` (upsell/message). Only build failures reach the inner `catch` (which may report). Ensure the outer `try {` opening and `this.exporting = true; this.errorMessage = null;` lines above are preserved.

- [ ] **Step 4: Delete the old remote and run tests**

```bash
rm src/routes/editor/export.remote.ts
```

Run: `bun run test:unit -- --run --project client src/routes/editor/editor.svelte.test.ts`
Expected: PASS (4 new export cases + existing).

- [ ] **Step 5: Typecheck**

Run: `bun run check`
Expected: no errors (no remaining references to `./export.remote`).

- [ ] **Step 6: Commit**

```bash
git add src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts
git rm src/routes/editor/export.remote.ts
git commit -m "feat(editor): build & export PDFs client-side behind a metadata gate"
```

---

### Task 5: Lazy-load + warm the WASM engine

The WASM is ~2.1 MB. Keep it out of the initial bundle (already achieved via the dynamic `import('$lib/pdf/build')` in Task 4) and warm it on idle after the editor mounts so the first export doesn't stall.

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts` (add `warmExportEngine`)
- Modify: `src/routes/editor/+page.svelte` (call on mount)
- Test: `src/routes/editor/editor.svelte.test.ts` (add a case)

**Interfaces:**
- Produces: `EditorState.warmExportEngine(): void` — idempotent; triggers `initializeWasm()` once.

- [ ] **Step 1: Write the failing test**

Add to `editor.svelte.test.ts`. Extend the `$lib/pdf/build` mock (Task 4) to also expose a warm hook, OR mock `@ignaciano3/better-pdf`'s `initializeWasm`. Simplest: have `warmExportEngine` import from `$lib/pdf/build`; add `initializeWasm` to that mock:

```typescript
// in the existing vi.mock('$lib/pdf/build', ...) factory add:
//   initializeWasm: vi.fn(async () => {})
```

Then:

```typescript
it('warmExportEngine initializes the WASM once', async () => {
	const { initializeWasm } = await import('$lib/pdf/build');
	const e = new EditorState();
	e.warmExportEngine();
	e.warmExportEngine();
	await Promise.resolve();
	expect(vi.mocked(initializeWasm)).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test:unit -- --run --project client src/routes/editor/editor.svelte.test.ts`
Expected: FAIL — `warmExportEngine` undefined.

- [ ] **Step 3: Re-export initializeWasm from build.ts and add the warm method**

In `src/lib/pdf/build.ts`, add near the top-level exports (so the client warms the same module it builds with, keeping one dynamic chunk):

```typescript
export { initializeWasm } from '@ignaciano3/better-pdf';
```

In `src/routes/editor/editor.svelte.ts`, add a private guard field and the method on `EditorState`:

```typescript
	#warmed = false;

	/** Preload the export WASM on idle so the first export is instant. Safe to
	 *  call repeatedly; only the first call does work. */
	warmExportEngine(): void {
		if (this.#warmed) return;
		this.#warmed = true;
		void import('$lib/pdf/build')
			.then((m) => m.initializeWasm())
			.catch(() => {
				// Warming is best-effort; export re-imports and retries on demand.
				this.#warmed = false;
			});
	}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test:unit -- --run --project client src/routes/editor/editor.svelte.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the warm-up into the editor page mount**

In `src/routes/editor/+page.svelte`, inside the existing `onMount` (or add one; `import { onMount } from 'svelte'`), warm on idle. Reference the `EditorState` instance the page already holds (match its local variable name, commonly `editor`):

```svelte
	onMount(() => {
		const warm = () => editor.warmExportEngine();
		if ('requestIdleCallback' in window) {
			(window as Window & typeof globalThis).requestIdleCallback(warm);
		} else {
			setTimeout(warm, 1500);
		}
	});
```

- [ ] **Step 6: Typecheck**

Run: `bun run check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdf/build.ts src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts src/routes/editor/+page.svelte
git commit -m "perf(editor): warm the export WASM on idle after mount"
```

---

### Task 6: Verify WASM asset serving end-to-end

Unit tests mock the WASM. This task proves the real browser build fetches and initializes it, in both dev and a production build. Apply the documented config fix only if verification fails.

**Files:**
- Modify (conditional): `vite.config.ts`

- [ ] **Step 1: Run the existing export e2e against dev**

Run: `bun run test:e2e -- e2e/export.spec.ts`
Expected: PASS — the blank-page export produces a `%PDF-` download, now built by the browser WASM.

- [ ] **Step 2: If the WASM 404s or fails to init, apply the asset config**

Only if Step 1 fails with a WASM fetch/init error, add to `vite.config.ts` inside `defineConfig({ ... })` (top level, sibling of `plugins`):

```typescript
	assetsInclude: ['**/*.wasm'],
	optimizeDeps: { exclude: ['@ignaciano3/better-pdf'] },
```

Re-run Step 1 until it passes. (`new URL('...bg.wasm', import.meta.url)` is emitted as a hashed asset by Vite; excluding the package from esbuild pre-bundling preserves that URL resolution.)

- [ ] **Step 3: Verify the production build serves the WASM**

Run: `bun run build && bun run preview &` then `bun run test:e2e -- e2e/export.spec.ts` against the preview server (or manually load `/editor`, export a blank page, confirm a valid PDF downloads and the Network panel shows the `.wasm` fetched with 200). Stop the preview server afterward.
Expected: export works against the built app.

- [ ] **Step 4: Commit (only if config changed)**

```bash
git add vite.config.ts
git commit -m "build: serve better-pdf WASM as a client asset"
```

---

### Task 7: Privacy e2e — assert no document bytes leave the browser

Encode the headline promise as a test: during export, the only server request is the tiny allowance ping — nothing carries the PDF.

**Files:**
- Modify: `e2e/export.spec.ts`

- [ ] **Step 1: Add the privacy assertion to the export flow test**

Append to `e2e/export.spec.ts` a new test that records remote-function requests during export and asserts none carries a document-sized payload:

```typescript
test('privacy: no document bytes are sent to the server on export', async ({ page }) => {
	await gotoEditorWithFingerprint(page, `e2e-privacy-${randomUUID()}`);
	await addTextElement(page);

	const remotePosts: number[] = [];
	page.on('request', (req) => {
		if (req.method() === 'POST' && req.url().includes('/_app/remote/')) {
			remotePosts.push((req.postData() ?? '').length);
		}
	});

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PDF' }).click();
	await downloadPromise;

	// The allowance ping carries only a fingerprint. No request may be large
	// enough to contain a PDF (fingerprint payload is well under 4 KB).
	expect(remotePosts.length).toBeGreaterThan(0);
	for (const size of remotePosts) expect(size).toBeLessThan(4096);
});
```

- [ ] **Step 2: Run the privacy + rate-limit e2e**

Run: `bun run test:e2e -- e2e/export.spec.ts e2e/rate-limit.spec.ts`
Expected: PASS — download fires, all remote POSTs are tiny, and the 3rd export still trips the upsell (the gate still counts server-side).

- [ ] **Step 3: Commit**

```bash
git add e2e/export.spec.ts
git commit -m "test(e2e): assert document bytes never leave the browser on export"
```

---

### Task 8: Privacy positioning (headline copy)

Make the promise a stated fact and disclose the only two things the server receives.

**Files:**
- Modify: `src/routes/+page.svelte` (home hero/section)
- Modify: `PRODUCT.md`

- [ ] **Step 1: State the promise on the home page**

In `src/routes/+page.svelte`, add a concise, honest privacy statement near the hero (follow DESIGN.md: slate + one Action Blue accent; no gradient blobs). Include the promise and the disclosure line. Example block (adapt to the page's existing structure/classes):

```svelte
<p class="text-body-slate">
	<strong class="text-ink">Your files never leave your device.</strong> PDFs are opened,
	edited, and exported entirely in your browser. The only data we receive is an anonymous
	usage count (to enforce free-tier limits) and, if an export fails, an anonymous error
	report — never your document’s contents.
</p>
```

- [ ] **Step 2: Update PRODUCT.md to state privacy as fact**

In `PRODUCT.md`, change the Product Purpose paragraph so it states processing is fully client-side and files never leave the device (it currently says "only finalize/export … route through a server gate"). Replace that clause with wording that the server gate is a metadata-only usage check and that document bytes are never transmitted.

- [ ] **Step 3: Verify the copy renders and lint the touched files**

Run: `bun run test:e2e -- e2e/export.spec.ts` (smoke — home/editor still load) and `bunx prettier --write src/routes/+page.svelte PRODUCT.md`
Expected: pages render; only the two touched files reformatted.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+page.svelte PRODUCT.md
git commit -m "docs(product): privacy is the headline — files never leave the device"
```

---

## Self-Review

**Spec coverage:**
- Architecture / clean cut (both ops to client, delete server build) → Tasks 1, 4 (deletes both remotes).
- Metadata gate (`checkExportAllowance`, fingerprint-only, existing rate limits, 429 contract, record-before-build) → Task 3, wired in Task 4.
- Client export flow (gate → validate → build → download) → Task 4.
- Error telemetry (PdfBuildError not reported; unexpected → metadata-only, no bytes/values) → Tasks 3 + 4.
- Performance (lazy WASM, warm on idle) → Tasks 4 (dynamic import) + 5.
- Privacy surface (headline copy + disclosure, PRODUCT.md) → Task 8.
- Testing (client extraction, adapted gate/error tests, export-flow component test, error classification, e2e no-bytes) → Tasks 1, 3, 4, 7.
- Risk G2 (SSR never evaluates WASM glue) → dynamic `import()` in Task 4/5; Risk WASM serving → Task 6.
- Deletions (`exportPdf`, `extractFields`, server build error logging) → Tasks 1, 3, 4.

**Placeholder scan:** No TBD/TODO; every code step shows full code. The one conditional (Task 6 config) has exact content and an explicit apply-if condition.

**Type consistency:** `ExtractFieldsResult` defined once in `extract-fields.ts` (Task 1), re-exported by `extract-fields-client.ts`. `extractFieldsFromBytes` name consistent across Tasks 1. `checkExportAllowance`/`reportExportError` signatures consistent across Tasks 3–4. `recordExportError`/`ExportErrorDetails` consistent across Task 3. `validateExportState` consistent across Tasks 2, 4. `warmExportEngine`/`initializeWasm` consistent across Task 5.
