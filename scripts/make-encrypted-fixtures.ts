/**
 * One-time fixture generator for encrypted-PDF unlock tests. Requires system
 * `qpdf`. Run with: `bun scripts/make-encrypted-fixtures.ts` (bun runs TS natively).
 * Commit the produced files under src/routes/editor/fixtures/.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PdfDocument } from '@ignaciano3/better-pdf';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../src/routes/editor/fixtures');
mkdirSync(outDir, { recursive: true });

// Base: a one-page form with a single text field named `full_name`.
const doc = await PdfDocument.create();
doc.addPage([595.28, 841.89]);
doc
	.createForm()
	.addTextField('full_name', { page: 0, x: 56, y: 700, width: 240, height: 22 });
const plain = await doc.save();
const plainPath = join(outDir, 'form-plain.pdf');
writeFileSync(plainPath, plain);

// Encrypt with qpdf. Owner password is arbitrary; user password controls open.
// Owner-locked: empty user password → opens with "".
execFileSync('qpdf', [
	'--encrypt', '', 'owner-secret', '256', '--',
	plainPath, join(outDir, 'form-owner-locked.pdf')
]);
// User-password: must supply "secret" to open.
execFileSync('qpdf', [
	'--encrypt', 'secret', 'owner-secret', '256', '--',
	plainPath, join(outDir, 'form-user-pw.pdf')
]);

console.log('Fixtures written to', outDir);
