# File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editor users embed arbitrary files into the exported PDF (and see files already embedded in an uploaded PDF), exposing the `@ignaciano3/better-pdf` `doc.attach()` / `doc.getAttachments()` API that the editor currently ignores.

**Architecture:** Attachments are **document-level** (not page-positioned), so they mirror the existing `metadata`/`outline`/`watermark` state — a plain `$state` list plus a modal — *not* the `EditElement` union. They carry a **provenance snapshot** (`sourceAttachmentNames`) exactly like `sourceFields`, so the two export paths behave correctly: the rebuild path (fresh `PdfDocument.create()`) re-attaches everything; the incremental path (loaded doc keeps its embedded files) attaches only *new* ones and forces a rebuild when a pre-existing attachment is removed (the library has no remove API).

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Vitest + `@testing-library/svelte`, `@ignaciano3/better-pdf` (browser/WASM build), Tailwind 4, bun.

## Global Constraints

- Use **bun**, never pnpm/npm (per `CLAUDE.md`). Run tests with `bun run test:unit -- --run <file>`.
- Prettier is **not** repo-wide clean — only format files you touch (`bunx prettier --write <file>`). Do not reformat untouched code.
- Attachments must survive a round-trip: an exported PDF re-uploaded into the editor must re-detect its attachments via `getAttachments()`.
- A single bad/duplicate attachment must never fail the whole export — skip it (mirrors the font/watermark/​signature error handling in `build.ts`).
- `attach()` throws `DuplicateAttachmentError` for a name already queued or already present in the loaded document — names must be unique across `attachments` + `sourceAttachmentNames`.
- `AfRelationship` allowed values (exact, from the library): `"Source" | "Data" | "Alternative" | "Supplement" | "EncryptedPayload" | "FormData" | "Schema" | "Unspecified"`.

---

### Task 1: Model + export-plan classifier

Add the attachment types to the shared model and teach the export classifier that removing a pre-existing attachment forces a rebuild. Pure logic — fully unit-testable before any PDF bytes are involved.

**Files:**
- Modify: `src/lib/pdf/types.ts` (add `AfRelationship`, `AttachmentInput`; extend `EditState`)
- Modify: `src/lib/pdf/export-plan.ts:14-22` (add the `attachment-removed` guard)
- Test: `src/lib/pdf/export-plan.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AfRelationship =
    | 'Source' | 'Data' | 'Alternative' | 'Supplement'
    | 'EncryptedPayload' | 'FormData' | 'Schema' | 'Unspecified';

  export interface AttachmentInput {
    id: string;               // editor-stable id (e.g. "att3")
    name: string;             // filespec name; unique within the document
    bytes: Uint8Array;        // raw file bytes
    mimeType?: string;        // -> AttachOptions.mimeType
    description?: string;     // -> AttachOptions.description
    afRelationship?: AfRelationship; // -> AttachOptions.afRelationship (+ /AF array)
  }
  ```
  `EditState.attachments?: AttachmentInput[]` and `EditState.sourceAttachmentNames?: string[]`.
- Consumes: `EditState` (existing).

- [ ] **Step 1: Write the failing test** — append to `src/lib/pdf/export-plan.test.ts`:

```ts
import { planExport } from './export-plan';
import type { EditState } from './types';

function baseState(over: Partial<EditState> = {}): EditState {
  return { pageSize: [200, 200], elements: [], sources: [new Uint8Array([1])], ...over };
}

describe('planExport attachments', () => {
  it('stays incremental when only new attachments are added', () => {
    const state = baseState({
      attachments: [{ id: 'a1', name: 'new.xml', bytes: new Uint8Array([1]) }],
      sourceAttachmentNames: []
    });
    expect(planExport(state).mode).toBe('incremental');
  });

  it('rebuilds when a pre-existing (source) attachment is removed', () => {
    const state = baseState({
      attachments: [], // was seeded with data.xml, now removed
      sourceAttachmentNames: ['data.xml']
    });
    const plan = planExport(state);
    expect(plan.mode).toBe('rebuild');
    expect(plan).toMatchObject({ reason: 'attachment-removed' });
  });

  it('stays incremental when a source attachment is kept', () => {
    const state = baseState({
      attachments: [{ id: 'a1', name: 'data.xml', bytes: new Uint8Array([1]) }],
      sourceAttachmentNames: ['data.xml']
    });
    expect(planExport(state).mode).toBe('incremental');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/pdf/export-plan.test.ts`
Expected: FAIL — TS error `attachments`/`sourceAttachmentNames` do not exist on `EditState` (and the removed-attachment case classifies as `incremental`).

- [ ] **Step 3: Add the model types** — in `src/lib/pdf/types.ts`, add above `EditState` (near the other exported unions):

```ts
/** /AFRelationship values (PDF 2.0 / PDF/A-3 associated files). Mirrors the
 * library's `AfRelationship`. */
export type AfRelationship =
  | 'Source'
  | 'Data'
  | 'Alternative'
  | 'Supplement'
  | 'EncryptedPayload'
  | 'FormData'
  | 'Schema'
  | 'Unspecified';

/**
 * A file embedded in the exported PDF (document-level; not page-positioned).
 * Applied at export via `doc.attach(bytes, name, options)`. Detected attachments
 * (read from an uploaded PDF) and authored ones share this shape.
 */
export interface AttachmentInput {
  /** Editor-stable id. */
  id: string;
  /** Filespec name; unique within the document. */
  name: string;
  /** Raw file bytes. */
  bytes: Uint8Array;
  /** MIME type (embedded stream `/Subtype`). Maps to the lib's `mimeType`. */
  mimeType?: string;
  /** Human-readable description (filespec `/Desc`). Maps to the lib's `description`. */
  description?: string;
  /** Associated-file relationship; also appends to the catalog `/AF` array. */
  afRelationship?: AfRelationship;
}
```

Then add to the `EditState` interface (next to `outline` / `watermark`):

```ts
  /**
   * Files embedded in the exported PDF via `doc.attach()`. Document-level, so
   * they are applied once at export regardless of page layout.
   */
  attachments?: AttachmentInput[];
  /**
   * Names of the attachments already embedded in source 0 at load time
   * (provenance for the incremental path, mirroring {@link sourceFields}). An
   * attachment whose name appears here already lives in the loaded document:
   * kept → skipped on the incremental path (re-attaching throws
   * DuplicateAttachmentError); removed → the export falls back to the full
   * rebuild (the library has no attachment-removal API).
   */
  sourceAttachmentNames?: string[];
```

- [ ] **Step 4: Add the classifier guard** — in `src/lib/pdf/export-plan.ts`, immediately after the `if (state.objectStreams) return { mode: 'rebuild', reason: 'compact-structure' };` line (currently line 22):

```ts
  // A pre-existing attachment can only be dropped by rebuilding — the loaded
  // document keeps its /EmbeddedFiles and the library has no remove API.
  const currentAttachmentNames = new Set((state.attachments ?? []).map((a) => a.name));
  for (const name of state.sourceAttachmentNames ?? []) {
    if (!currentAttachmentNames.has(name)) {
      return { mode: 'rebuild', reason: 'attachment-removed' };
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/lib/pdf/export-plan.test.ts`
Expected: PASS (all three new cases + existing cases).

- [ ] **Step 6: Format and commit**

```bash
bunx prettier --write src/lib/pdf/types.ts src/lib/pdf/export-plan.ts src/lib/pdf/export-plan.test.ts
git add src/lib/pdf/types.ts src/lib/pdf/export-plan.ts src/lib/pdf/export-plan.test.ts
git commit -m "feat(editor): model file attachments + export-plan removal guard"
```

---

### Task 2: Export builder wiring

Attach files during export on both build paths. This is the task that actually writes `/EmbeddedFiles`.

**Files:**
- Modify: `src/lib/pdf/build.ts` (import `AttachmentInput`; add `applyAttachments`; call it in `finishDoc` and `buildIncremental`)
- Test: `src/lib/pdf/build.attachment.test.ts` (create)

**Interfaces:**
- Consumes: `EditState.attachments`, `EditState.sourceAttachmentNames`, `AttachmentInput` (Task 1); `PdfDocument.attach` / `getAttachments` (library).
- Produces: `function applyAttachments(doc: PdfDocument, attachments: AttachmentInput[] | undefined, skipNames: ReadonlySet<string>): void`.

- [ ] **Step 1: Write the failing test** — create `src/lib/pdf/build.attachment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { buildPdf } from './build';
import type { EditState } from './types';

const xml = () => new TextEncoder().encode('<invoice/>');

async function namesOf(bytes: Uint8Array): Promise<string[]> {
  const doc = await PdfDocument.load(bytes);
  return (await doc.getAttachments()).map((a) => a.name).sort();
}

// A one-page source PDF to exercise the source paths.
async function sourcePdf(): Promise<Uint8Array> {
  const doc = await PdfDocument.create();
  doc.addPage([200, 200]);
  return doc.save();
}

describe('attachments export', () => {
  it('embeds an attachment on the blank rebuild path', async () => {
    const state: EditState = {
      pageSize: [200, 200],
      elements: [],
      attachments: [{ id: 'a1', name: 'data.xml', bytes: xml(), mimeType: 'text/xml' }]
    };
    expect(await namesOf(await buildPdf(state))).toEqual(['data.xml']);
  });

  it('adds only NEW attachments on the incremental path, keeping source ones', async () => {
    // Source already carries keep.xml.
    const src = await PdfDocument.load(await sourcePdf());
    src.attach(xml(), 'keep.xml');
    const withAttachment = await src.save();

    const state: EditState = {
      pageSize: [200, 200],
      elements: [],
      sources: [withAttachment],
      sourceAttachmentNames: ['keep.xml'],
      attachments: [
        { id: 'a1', name: 'keep.xml', bytes: xml() }, // unchanged source one
        { id: 'a2', name: 'added.xml', bytes: xml() } // new
      ]
    };
    // No source-field changes / rotation / objectStreams => incremental path.
    expect(await namesOf(await buildPdf(state))).toEqual(['added.xml', 'keep.xml']);
  });

  it('re-attaches survivors via rebuild when a source attachment is removed', async () => {
    const src = await PdfDocument.load(await sourcePdf());
    src.attach(xml(), 'drop.xml');
    src.attach(xml(), 'keep.xml');
    const withAttachments = await src.save();

    const state: EditState = {
      pageSize: [200, 200],
      elements: [],
      sources: [withAttachments],
      sourceAttachmentNames: ['drop.xml', 'keep.xml'],
      attachments: [{ id: 'a1', name: 'keep.xml', bytes: xml() }] // drop.xml removed
    };
    // attachment-removed => rebuild => fresh doc gets only keep.xml.
    expect(await namesOf(await buildPdf(state))).toEqual(['keep.xml']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/lib/pdf/build.attachment.test.ts`
Expected: FAIL — no attachments are written (empty arrays returned).

- [ ] **Step 3: Import the type** — in `src/lib/pdf/build.ts`, extend the type import block (currently importing from `'./types'`) to include `AttachmentInput`:

```ts
import type {
  AttachmentInput,
  DocumentMetadataInput,
  EditElement,
  EditState,
  EmbeddedFontAsset,
  FieldElement,
  OutlineItem,
  PageOp
} from './types';
```

- [ ] **Step 4: Add the `applyAttachments` helper** — in `src/lib/pdf/build.ts`, add immediately after `applyDocumentProps` (after its closing brace, ~line 339):

```ts
/**
 * Attach queued files to the document. `skipNames` lists attachments already
 * embedded in the loaded source (the incremental path) — re-attaching one
 * throws DuplicateAttachmentError, so they are skipped. On a rebuild the fresh
 * document has none, so `skipNames` is empty and every attachment is written.
 * A single bad/duplicate attachment is skipped rather than failing the export.
 */
function applyAttachments(
  doc: PdfDocument,
  attachments: AttachmentInput[] | undefined,
  skipNames: ReadonlySet<string>
): void {
  if (!attachments) return;
  for (const a of attachments) {
    if (skipNames.has(a.name)) continue;
    if (!(a.bytes instanceof Uint8Array) || a.bytes.byteLength === 0) continue;
    try {
      doc.attach(a.bytes, a.name, {
        ...(a.mimeType ? { mimeType: a.mimeType } : {}),
        ...(a.description ? { description: a.description } : {}),
        ...(a.afRelationship ? { afRelationship: a.afRelationship } : {})
      });
    } catch {
      // Duplicate or invalid attachment — skip it; the export still succeeds.
    }
  }
}
```

- [ ] **Step 5: Wire the rebuild path** — in `finishDoc`, right after the `applyDocumentProps(doc, state.metadata, state.outline, pageHeights.length);` line (~line 546):

```ts
  // Fresh document: it has no attachments yet, so write every one (skip set empty).
  applyAttachments(doc, state.attachments, new Set());
```

- [ ] **Step 6: Wire the incremental path** — in `buildIncremental`, right after its `applyDocumentProps(...)` line (~line 182):

```ts
  // Loaded document already carries its source attachments — attach only the new
  // ones (re-attaching a source name would throw DuplicateAttachmentError).
  applyAttachments(doc, state.attachments, new Set(state.sourceAttachmentNames ?? []));
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/lib/pdf/build.attachment.test.ts`
Expected: PASS (3/3). Also run the existing build suites to confirm no regression:
Run: `bun run test:unit -- --run src/lib/pdf/build.test.ts src/lib/pdf/build.incremental.test.ts`
Expected: PASS.

- [ ] **Step 8: Format and commit**

```bash
bunx prettier --write src/lib/pdf/build.ts src/lib/pdf/build.attachment.test.ts
git add src/lib/pdf/build.ts src/lib/pdf/build.attachment.test.ts
git commit -m "feat(editor): write file attachments on both export paths"
```

---

### Task 3: Export validation

Bound the attachment payload before it reaches the WASM parser, mirroring `validateWatermark`/`validateMetadata`.

**Files:**
- Modify: `src/routes/editor/export-validate.ts` (add caps + `validateAttachments`; wire into `validateExportState`)
- Test: `src/routes/editor/export-validate.test.ts`

**Interfaces:**
- Consumes: `EditState.attachments`, `EditState.sourceAttachmentNames`, `AfRelationship` (Task 1).
- Produces: `validateExportState` now rejects malformed/oversized attachments with SvelteKit `error(413|422)`.

- [ ] **Step 1: Write the failing test** — append to `src/routes/editor/export-validate.test.ts`:

```ts
import { validateExportState } from './export-validate';
import type { EditState } from '$lib/pdf/types';

const ok = (): EditState => ({ pageSize: [200, 200], elements: [] });

describe('validateExportState attachments', () => {
  it('accepts a well-formed attachment', () => {
    expect(() =>
      validateExportState({
        ...ok(),
        attachments: [
          { id: 'a1', name: 'data.xml', bytes: new Uint8Array([1]), mimeType: 'text/xml' }
        ],
        sourceAttachmentNames: ['data.xml']
      })
    ).not.toThrow();
  });

  it('rejects a bad afRelationship', () => {
    expect(() =>
      validateExportState({
        ...ok(),
        attachments: [{ id: 'a1', name: 'x', bytes: new Uint8Array([1]), afRelationship: 'Nope' }]
      })
    ).toThrow();
  });

  it('rejects non-Uint8Array bytes', () => {
    expect(() =>
      validateExportState({
        ...ok(),
        attachments: [{ id: 'a1', name: 'x', bytes: 'not-bytes' }]
      })
    ).toThrow();
  });

  it('rejects an empty name', () => {
    expect(() =>
      validateExportState({
        ...ok(),
        attachments: [{ id: 'a1', name: '', bytes: new Uint8Array([1]) }]
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/routes/editor/export-validate.test.ts`
Expected: FAIL — the bad-afRelationship / bad-bytes / empty-name cases do not throw (attachments are currently unvalidated).

- [ ] **Step 3: Add caps** — in `src/routes/editor/export-validate.ts`, after the outline caps block (~after `MAX_OUTLINE_TITLE_LEN`):

```ts
// Attachment caps.
const MAX_ATTACHMENTS = 100;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB per embedded file
const MAX_TOTAL_ATTACHMENT_BYTES = 60 * 1024 * 1024; // 60 MB across all attachments
const MAX_ATTACHMENT_NAME_LEN = 260;
const AF_RELATIONSHIPS = [
  'Source',
  'Data',
  'Alternative',
  'Supplement',
  'EncryptedPayload',
  'FormData',
  'Schema',
  'Unspecified'
];
```

- [ ] **Step 4: Add `validateAttachments`** — add near `validateWatermark` in the same file:

```ts
/** Validate the attachment list: bounded count/size, string name + optional
 * metadata, and a known afRelationship. */
function validateAttachments(list: unknown): void {
  if (!Array.isArray(list)) error(422, 'Invalid attachments');
  if (list.length > MAX_ATTACHMENTS) error(422, 'Too many attachments');
  let total = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') error(422, 'Invalid attachment');
    const a = raw as {
      id?: unknown;
      name?: unknown;
      bytes?: unknown;
      mimeType?: unknown;
      description?: unknown;
      afRelationship?: unknown;
    };
    if (typeof a.id !== 'string' || a.id.length === 0) error(422, 'Invalid attachment id');
    if (typeof a.name !== 'string' || a.name.length === 0) error(422, 'Invalid attachment name');
    if ((a.name as string).length > MAX_ATTACHMENT_NAME_LEN) error(422, 'Attachment name too large');
    if (!(a.bytes instanceof Uint8Array)) error(422, 'Invalid attachment bytes');
    if ((a.bytes as Uint8Array).byteLength > MAX_ATTACHMENT_BYTES) error(413, 'Attachment too large');
    total += (a.bytes as Uint8Array).byteLength;
    if (a.mimeType !== undefined && typeof a.mimeType !== 'string') {
      error(422, 'Invalid attachment mimeType');
    }
    if (a.description !== undefined && typeof a.description !== 'string') {
      error(422, 'Invalid attachment description');
    }
    if (
      a.afRelationship !== undefined &&
      !AF_RELATIONSHIPS.includes(a.afRelationship as string)
    ) {
      error(422, 'Invalid attachment afRelationship');
    }
  }
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) error(413, 'Attachments too large');
}
```

- [ ] **Step 5: Wire into `validateExportState`** — add next to the `if (state.watermark !== undefined) validateWatermark(state.watermark);` line:

```ts
  if (state.attachments !== undefined) validateAttachments(state.attachments);
  if (state.sourceAttachmentNames !== undefined) {
    if (!Array.isArray(state.sourceAttachmentNames)) error(422, 'Invalid source attachment names');
    if (state.sourceAttachmentNames.length > MAX_ATTACHMENTS) {
      error(422, 'Too many source attachment names');
    }
    for (const n of state.sourceAttachmentNames) {
      if (typeof n !== 'string') error(422, 'Invalid source attachment name');
      if (n.length > MAX_ATTACHMENT_NAME_LEN) error(422, 'Source attachment name too large');
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/routes/editor/export-validate.test.ts`
Expected: PASS.

- [ ] **Step 7: Format and commit**

```bash
bunx prettier --write src/routes/editor/export-validate.ts src/routes/editor/export-validate.test.ts
git add src/routes/editor/export-validate.ts src/routes/editor/export-validate.test.ts
git commit -m "feat(editor): validate attachment payload caps"
```

---

### Task 4: Client-side attachment read-back helper + size cap

Read the files already embedded in an uploaded PDF, client-side (WASM), mirroring `extract-fields-client.ts`. Also add the editor-side per-file size cap constant.

**Files:**
- Create: `src/routes/editor/extract-attachments-client.ts`
- Modify: `src/routes/editor/constants.ts` (add `MAX_ATTACHMENT_BYTES`)
- Test: `src/routes/editor/extract-attachments-client.test.ts` (create)

**Interfaces:**
- Consumes: `AttachmentInput` (Task 1); `PdfDocument.load` / `getAttachments` (library).
- Produces:
  - `export async function extractAttachmentsFromBytes(bytes: Uint8Array, makeId: () => string): Promise<AttachmentInput[]>`
  - `export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024` in `constants.ts`.

- [ ] **Step 1: Write the failing test** — create `src/routes/editor/extract-attachments-client.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { extractAttachmentsFromBytes } from './extract-attachments-client';

describe('extractAttachmentsFromBytes', () => {
  it('reads embedded files back with a fresh id each', async () => {
    const doc = await PdfDocument.create();
    doc.addPage([200, 200]);
    doc.attach(new TextEncoder().encode('<x/>'), 'data.xml', { mimeType: 'text/xml' });
    const bytes = await doc.save();

    let n = 0;
    const atts = await extractAttachmentsFromBytes(bytes, () => `att${n++}`);
    expect(atts).toHaveLength(1);
    expect(atts[0]).toMatchObject({ id: 'att0', name: 'data.xml', mimeType: 'text/xml' });
    expect(atts[0].bytes).toBeInstanceOf(Uint8Array);
  });

  it('returns an empty list for a PDF with no attachments', async () => {
    const doc = await PdfDocument.create();
    doc.addPage([200, 200]);
    const atts = await extractAttachmentsFromBytes(await doc.save(), () => 'x');
    expect(atts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/routes/editor/extract-attachments-client.test.ts`
Expected: FAIL — module `./extract-attachments-client` not found.

- [ ] **Step 3: Create the helper** — `src/routes/editor/extract-attachments-client.ts`:

```ts
import { PdfDocument } from '@ignaciano3/better-pdf';
import type { AttachmentInput } from '$lib/pdf/types';

/**
 * Read every file embedded in `bytes` (client-side WASM; bytes never leave the
 * browser). Returns editor attachment records, one per embedded file, each with
 * a fresh id from `makeId`. The caller swallows failures — the editor still
 * opens with no attachments surfaced.
 */
export async function extractAttachmentsFromBytes(
  bytes: Uint8Array,
  makeId: () => string
): Promise<AttachmentInput[]> {
  const doc = await PdfDocument.load(bytes);
  const found = await doc.getAttachments();
  return found.map((a) => ({
    id: makeId(),
    name: a.name,
    bytes: a.bytes,
    ...(a.mimeType ? { mimeType: a.mimeType } : {}),
    ...(a.description ? { description: a.description } : {}),
    ...(a.afRelationship ? { afRelationship: a.afRelationship } : {})
  }));
}
```

- [ ] **Step 4: Add the size cap** — in `src/routes/editor/constants.ts`, after `MAX_FONT_BYTES`:

```ts
/** Max size of a single file the user can embed as an attachment. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/routes/editor/extract-attachments-client.test.ts`
Expected: PASS.

- [ ] **Step 6: Format and commit**

```bash
bunx prettier --write src/routes/editor/extract-attachments-client.ts src/routes/editor/extract-attachments-client.test.ts src/routes/editor/constants.ts
git add src/routes/editor/extract-attachments-client.ts src/routes/editor/extract-attachments-client.test.ts src/routes/editor/constants.ts
git commit -m "feat(editor): read existing PDF attachments client-side"
```

---

### Task 5: Editor state

Add attachments to the editor's single source of truth: reactive list, history tracking, add/remove with dedup, read-back on upload, clear on source change, and export wiring.

**Files:**
- Modify: `src/routes/editor/editor.svelte.ts` (imports; `DocSnapshot`; state fields; `#takeSnapshot`/`#applySnapshot`/tracking effect; `addAttachment`/`removeAttachment`; `loadSource` read-back; `clearSource`; `export()` payload)
- Test: `src/routes/editor/editor.svelte.test.ts`

**Interfaces:**
- Consumes: `AttachmentInput` (Task 1), `extractAttachmentsFromBytes` (Task 4), `MAX_ATTACHMENT_BYTES` (Task 4), existing `nextId('att')` helper.
- Produces (public on `EditorState`):
  - `attachments: AttachmentInput[]` ($state)
  - `sourceAttachmentNames: string[]` ($state)
  - `attachmentsModalOpen: boolean` ($state)
  - `addAttachment(file: File): Promise<void>`
  - `removeAttachment(id: string): void`

- [ ] **Step 1: Write the failing test** — append to `src/routes/editor/editor.svelte.test.ts`:

```ts
import { EditorState } from './editor.svelte';

function fileOf(name: string, body = 'x', type = 'text/xml'): File {
  return new File([body], name, { type });
}

describe('attachments state', () => {
  it('adds an attachment and records an undo step', async () => {
    const ed = new EditorState();
    await ed.addAttachment(fileOf('a.xml'));
    expect(ed.attachments.map((a) => a.name)).toEqual(['a.xml']);
    ed.flushHistory();
    expect(ed.canUndo).toBe(true);
    ed.undo();
    expect(ed.attachments).toEqual([]);
  });

  it('rejects a duplicate name', async () => {
    const ed = new EditorState();
    await ed.addAttachment(fileOf('a.xml'));
    await ed.addAttachment(fileOf('a.xml'));
    expect(ed.attachments).toHaveLength(1);
    expect(ed.errorMessage).toMatch(/already exists/i);
  });

  it('removes by id', async () => {
    const ed = new EditorState();
    await ed.addAttachment(fileOf('a.xml'));
    ed.removeAttachment(ed.attachments[0].id);
    expect(ed.attachments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/routes/editor/editor.svelte.test.ts`
Expected: FAIL — `addAttachment` / `attachments` / `removeAttachment` do not exist.

- [ ] **Step 3: Add imports** — in `src/routes/editor/editor.svelte.ts`, add `AttachmentInput` to the `$lib/pdf/types` import, add the extract helper import, and add `MAX_ATTACHMENT_BYTES` to the constants import:

```ts
// in the type import from '$lib/pdf/types'
  AttachmentInput,
// new import near extract-fields-client import
import { extractAttachmentsFromBytes } from './extract-attachments-client';
// add to the constants import that already brings in MAX_PDF_BYTES / MAX_FONT_BYTES
  MAX_ATTACHMENT_BYTES,
```

- [ ] **Step 4: Add state fields** — next to `outline = $state<OutlineItem[]>([])` (~line 214):

```ts
  /** Files embedded in the exported PDF (document-level). */
  attachments = $state<AttachmentInput[]>([]);
  /** Names of attachments present in source 0 at load (provenance for the
   * incremental export path — see EditState.sourceAttachmentNames). */
  sourceAttachmentNames = $state<string[]>([]);
```

And next to `docPropsModalOpen = $state(false)` (~line 227):

```ts
  /** True while the attachments modal is open. */
  attachmentsModalOpen = $state(false);
```

- [ ] **Step 5: Thread through history** — four edits:

In the `DocSnapshot` interface (~line 81) add:
```ts
  attachments: AttachmentInput[];
```
In `#takeSnapshot` (~line 332) add `attachments: this.attachments,` to the snapshot object.
In `#applySnapshot` (~line 359) add `this.attachments = c.attachments;` alongside the other assignments.
In the constructor tracking effect (~line 303) add `this.#track(this.attachments);` next to `this.#track(this.outline);`.

- [ ] **Step 6: Add the methods** — after `clearCustomFont` (~line 1531), before `// --- export`:

```ts
  // --- attachments ---------------------------------------------------------

  /**
   * Embed a file as a document attachment. Rejects a name already used by
   * another attachment or already present in the source (the library throws
   * DuplicateAttachmentError at export otherwise).
   */
  async addAttachment(file: File): Promise<void> {
    this.errorMessage = null;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      this.errorMessage = `That file is too large (max ${Math.round(
        MAX_ATTACHMENT_BYTES / 1024 / 1024
      )} MB).`;
      return;
    }
    const name = file.name;
    const taken = new Set([
      ...this.attachments.map((a) => a.name),
      ...this.sourceAttachmentNames
    ]);
    if (taken.has(name)) {
      this.errorMessage = `An attachment named “${name}” already exists.`;
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const asset: AttachmentInput = {
        id: this.nextId('att'),
        name,
        bytes,
        ...(file.type ? { mimeType: file.type } : {})
      };
      this.attachments = [...this.attachments, asset];
    } catch {
      this.errorMessage = 'Could not read that file.';
    }
  }

  /** Remove an attachment by id. Removing a source-origin one routes the export
   * to the rebuild path (see planExport's attachment-removed guard). */
  removeAttachment(id: string): void {
    this.attachments = this.attachments.filter((a) => a.id !== id);
  }
```

- [ ] **Step 7: Read attachments on upload** — in `loadSource`, after `this.sourceFields = structuredClone(detected);` (~line 1260), before `this.#history.reset();`:

```ts
      // Read files already embedded in the uploaded PDF (client WASM). Failures
      // are swallowed — the editor still opens with no attachments surfaced.
      try {
        const atts = await extractAttachmentsFromBytes(exportCopy.slice(), () => this.nextId('att'));
        this.attachments = atts;
        this.sourceAttachmentNames = atts.map((a) => a.name);
      } catch {
        this.attachments = [];
        this.sourceAttachmentNames = [];
      }
```

- [ ] **Step 8: Clear on source change** — in `clearSource` (~line 1287), next to `this.outline = [];`:

```ts
    this.attachments = [];
    this.sourceAttachmentNames = [];
```

- [ ] **Step 9: Ship in export payload** — in `export()`, in the `EditState` literal after the `watermark` spread (~line 1567):

```ts
        ...(this.attachments.length > 0
          ? {
              attachments: $state.snapshot(this.attachments) as AttachmentInput[],
              ...(this.sourceAttachmentNames.length > 0
                ? { sourceAttachmentNames: [...this.sourceAttachmentNames] }
                : {})
            }
          : {}),
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/routes/editor/editor.svelte.test.ts`
Expected: PASS.

- [ ] **Step 11: Format and commit**

```bash
bunx prettier --write src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts
git add src/routes/editor/editor.svelte.ts src/routes/editor/editor.svelte.test.ts
git commit -m "feat(editor): attachments in editor state (add/remove/read-back/export)"
```

---

### Task 6: Attachments modal + toolbar entry

Surface attachments in the UI: a modal to add/remove/edit metadata, a Document-menu entry, and the modal mount.

**Files:**
- Create: `src/routes/editor/AttachmentsModal.svelte`
- Modify: `src/routes/editor/Toolbar.svelte:245-254` (add the menu button after "Watermark…")
- Modify: `src/routes/editor/+page.svelte:11-13,329-331` (import + mount)
- Test: `src/routes/editor/AttachmentsModal.svelte.test.ts` (create)

**Interfaces:**
- Consumes: `EditorState.attachments`, `addAttachment`, `removeAttachment`, `attachmentsModalOpen`, `sourceAttachmentNames`, `AfRelationship` (Task 1/5).

- [ ] **Step 1: Write the failing test** — create `src/routes/editor/AttachmentsModal.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import AttachmentsModal from './AttachmentsModal.svelte';
import { EditorState } from './editor.svelte';

it('lists attachments and removes one', async () => {
  const editor = new EditorState();
  await editor.addAttachment(new File(['x'], 'report.xml', { type: 'text/xml' }));
  editor.attachmentsModalOpen = true;

  render(AttachmentsModal, { editor });
  expect(screen.getByText('report.xml')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /remove report\.xml/i }));
  expect(editor.attachments).toHaveLength(0);
});

it('is hidden when closed', () => {
  const editor = new EditorState();
  render(AttachmentsModal, { editor });
  expect(screen.queryByText(/attachments/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- --run src/routes/editor/AttachmentsModal.svelte.test.ts`
Expected: FAIL — module `./AttachmentsModal.svelte` not found.

- [ ] **Step 3: Create the modal** — `src/routes/editor/AttachmentsModal.svelte` (patterned on `DocumentPropertiesModal.svelte`):

```svelte
<script lang="ts">
  import type { EditorState } from './editor.svelte';
  import type { AfRelationship } from '$lib/pdf/types';

  let { editor }: { editor: EditorState } = $props();

  const open = $derived(editor.attachmentsModalOpen);
  const sourceNames = $derived(new Set(editor.sourceAttachmentNames));

  const REL: AfRelationship[] = [
    'Unspecified',
    'Source',
    'Data',
    'Alternative',
    'Supplement',
    'EncryptedPayload',
    'FormData',
    'Schema'
  ];

  function fmtSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  async function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    for (const f of files) await editor.addAttachment(f);
    input.value = '';
  }

  function setField(id: string, key: 'description' | 'afRelationship', value: string) {
    editor.attachments = editor.attachments.map((a) =>
      a.id === id ? { ...a, [key]: value || undefined } : a
    );
  }

  function close() {
    editor.attachmentsModalOpen = false;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div class="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
      <h2 class="mb-1 text-base font-semibold text-slate-900">Attachments</h2>
      <p class="mb-4 text-xs text-slate-500">
        Files embedded in the exported PDF (e.g. an XML invoice sidecar).
      </p>

      {#if editor.attachments.length === 0}
        <p class="rounded border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
          No attachments yet.
        </p>
      {:else}
        <ul class="flex flex-col gap-3">
          {#each editor.attachments as a (a.id)}
            <li class="rounded border border-slate-200 p-3">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-slate-800">{a.name}</p>
                  <p class="text-xs text-slate-500">
                    {fmtSize(a.bytes.byteLength)}{a.mimeType ? ` · ${a.mimeType}` : ''}
                    {#if sourceNames.has(a.name)}
                      <span class="ml-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">
                        in source
                      </span>
                    {/if}
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  aria-label={`Remove ${a.name}`}
                  onclick={() => editor.removeAttachment(a.id)}
                >
                  Remove
                </button>
              </div>
              <div class="mt-2 flex gap-2">
                <input
                  type="text"
                  class="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                  placeholder="Description (optional)"
                  value={a.description ?? ''}
                  oninput={(e) => setField(a.id, 'description', (e.currentTarget as HTMLInputElement).value)}
                />
                <select
                  class="rounded border border-slate-300 px-2 py-1 text-xs"
                  value={a.afRelationship ?? 'Unspecified'}
                  onchange={(e) => setField(a.id, 'afRelationship', (e.currentTarget as HTMLSelectElement).value)}
                >
                  {#each REL as r (r)}<option value={r}>{r}</option>{/each}
                </select>
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="mt-4 flex items-center justify-between">
        <label class="cursor-pointer rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Add file…
          <input type="file" multiple class="hidden" onchange={onPick} />
        </label>
        <button
          type="button"
          class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          onclick={close}
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 4: Add the toolbar entry** — in `src/routes/editor/Toolbar.svelte`, after the "Watermark…" button block (after line 254):

```svelte
							<button
								class={menuItem}
								role="menuitem"
								onclick={() => {
									editor.attachmentsModalOpen = true;
									docMenuOpen = false;
								}}
							>
								Attachments…
							</button>
```

- [ ] **Step 5: Mount the modal** — in `src/routes/editor/+page.svelte`, add the import next to the other modal imports (~line 13):

```svelte
	import AttachmentsModal from './AttachmentsModal.svelte';
```
and the mount next to `<WatermarkModal {editor} />` (~line 331):
```svelte
	<AttachmentsModal {editor} />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test:unit -- --run src/routes/editor/AttachmentsModal.svelte.test.ts`
Expected: PASS.

- [ ] **Step 7: Format and commit**

```bash
bunx prettier --write src/routes/editor/AttachmentsModal.svelte src/routes/editor/AttachmentsModal.svelte.test.ts src/routes/editor/Toolbar.svelte src/routes/editor/+page.svelte
git add src/routes/editor/AttachmentsModal.svelte src/routes/editor/AttachmentsModal.svelte.test.ts src/routes/editor/Toolbar.svelte src/routes/editor/+page.svelte
git commit -m "feat(editor): attachments modal + toolbar entry"
```

---

### Task 7: Full-suite gate + typecheck

Confirm the whole feature holds together and nothing regressed.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `bun run check`
Expected: no new errors in the touched files.

- [ ] **Step 2: Full unit suite**

Run: `bun run test:unit -- --run`
Expected: PASS (pre-existing unrelated failures, if any, unchanged).

- [ ] **Step 3: Manual smoke (optional but recommended)** — via the `run` skill / `bun run dev`: upload a PDF that has an embedded file → open Document ▸ Attachments → confirm it's listed "in source"; add a new file; export; re-upload the export → confirm both attachments are detected.

- [ ] **Step 4: Commit any doc touch-ups** (if the smoke test surfaced a copy fix).

---

## Self-Review

**Spec coverage** (against the earlier design):
- Document-level model mirroring metadata/outline → Task 1 (`AttachmentInput`, `EditState.attachments`).
- Provenance model (`sourceAttachmentNames`) → Task 1; consumed by Task 2 (incremental skip-set) and Task 1 classifier (`attachment-removed`).
- Attach on both export paths → Task 2 (`finishDoc` rebuild + `buildIncremental`).
- Read existing attachments on upload → Task 4 helper + Task 5 `loadSource` wiring.
- Validation caps → Task 3.
- UI (modal + toolbar + mount) → Task 6.
- Tests at every layer → Tasks 1–6; gate → Task 7.

**Type consistency:** `AttachmentInput` fields (`id`, `name`, `bytes`, `mimeType?`, `description?`, `afRelationship?`) are used identically in Tasks 2–6. `extractAttachmentsFromBytes(bytes, makeId)` signature is defined in Task 4 and called with `(exportCopy.slice(), () => this.nextId('att'))` in Task 5. `applyAttachments(doc, attachments, skipNames)` is defined and called with a `Set` in Task 2. `AfRelationship` union matches the library's exact eight values and the validator's `AF_RELATIONSHIPS` list.

**Placeholder scan:** none — every code step contains complete content.

**Known simplification (intentional, YAGNI):** v1 does not expose `creationDate`/`modificationDate` inputs (the library does not default them; determinism preserved). Adding two `<input type="date">` fields to the modal + two lines in `applyAttachments` later is trivial.
