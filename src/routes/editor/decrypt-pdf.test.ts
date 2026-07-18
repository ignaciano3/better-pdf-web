import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfDocument } from '@ignaciano3/better-pdf';
import { decryptIfNeeded, DecryptCancelled, type PasswordResolver } from './decrypt-pdf';

const dir = join(__dirname, 'fixtures');
const bytesOf = (f: string) => new Uint8Array(readFileSync(join(dir, f)));
const never: () => Promise<string> = () => {
	throw new Error('resolver should not be called');
};

async function fieldNames(bytes: Uint8Array): Promise<string[]> {
	const doc = await PdfDocument.load(bytes);
	return (doc.getForm().getFields() as Array<{ name: string }>).map((f) => f.name);
}

describe('decryptIfNeeded — decrypted output invariant', () => {
	it('owner-locked file decrypts to plaintext that still has the field', async () => {
		const { bytes, decrypted } = await decryptIfNeeded(bytesOf('form-owner-locked.pdf'), never);
		expect(decrypted).toBe(true);
		expect(await PdfDocument.isEncrypted(bytes)).toBe(false);
		expect(await fieldNames(bytes)).toContain('full_name');
	});
});

describe('decryptIfNeeded — behavior', () => {
	it('returns non-encrypted input unchanged, never calling the resolver', async () => {
		const input = bytesOf('form-plain.pdf');
		const resolver = vi.fn(never);
		const { bytes, decrypted } = await decryptIfNeeded(input, resolver);
		expect(decrypted).toBe(false);
		expect(bytes).toBe(input); // same reference, no copy
		expect(resolver).not.toHaveBeenCalled();
	});

	it('decrypts a user-password file with the correct password', async () => {
		const resolver = vi.fn(async () => 'secret');
		const { bytes, decrypted } = await decryptIfNeeded(bytesOf('form-user-pw.pdf'), resolver);
		expect(decrypted).toBe(true);
		expect(await PdfDocument.isEncrypted(bytes)).toBe(false);
		expect(await fieldNames(bytes)).toContain('full_name');
		expect(resolver).toHaveBeenCalledTimes(1);
		expect(resolver).toHaveBeenCalledWith(false);
	});

	it('re-prompts with wrongPassword=true after a bad password', async () => {
		const resolver = vi
			.fn<PasswordResolver>()
			.mockResolvedValueOnce('nope')
			.mockResolvedValueOnce('secret');
		const { decrypted } = await decryptIfNeeded(bytesOf('form-user-pw.pdf'), resolver);
		expect(decrypted).toBe(true);
		expect(resolver).toHaveBeenNthCalledWith(1, false);
		expect(resolver).toHaveBeenNthCalledWith(2, true);
	});

	it('propagates DecryptCancelled when the user cancels', async () => {
		const resolver = vi.fn(async () => {
			throw new DecryptCancelled();
		});
		await expect(decryptIfNeeded(bytesOf('form-user-pw.pdf'), resolver)).rejects.toBeInstanceOf(
			DecryptCancelled
		);
	});
});
