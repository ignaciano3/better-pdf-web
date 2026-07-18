import { PdfDocument } from '@ignaciano3/better-pdf';

/** Thrown when the user dismisses the password prompt. Callers abort silently. */
export class DecryptCancelled extends Error {
	constructor() {
		super('Password entry cancelled');
		this.name = 'DecryptCancelled';
	}
}

/**
 * Resolve a password for an encrypted PDF. `wrongPassword` is true when
 * re-prompting after a failed attempt. Reject with `DecryptCancelled` when the
 * user cancels.
 */
export type PasswordResolver = (wrongPassword: boolean) => Promise<string>;

/** Load with the given password and re-serialize to decrypted plaintext bytes. */
async function toPlaintext(bytes: Uint8Array, password: string): Promise<Uint8Array> {
	const doc = await PdfDocument.load(bytes, { password });
	return await doc.save();
}

/**
 * Return plaintext bytes for a possibly-encrypted PDF. Non-encrypted input is
 * returned unchanged. Owner-locked / empty-user-password files decrypt silently.
 * Otherwise `getPassword` is called (and re-called on wrong passwords) until a
 * valid password is supplied or the user cancels (→ `DecryptCancelled`).
 */
export async function decryptIfNeeded(
	bytes: Uint8Array,
	getPassword: PasswordResolver
): Promise<{ bytes: Uint8Array; decrypted: boolean }> {
	if (!(await PdfDocument.isEncrypted(bytes))) {
		return { bytes, decrypted: false };
	}
	// Owner-locked / empty-user-password: opens with "".
	if ((await PdfDocument.passwordType(bytes, '')) !== null) {
		return { bytes: await toPlaintext(bytes, ''), decrypted: true };
	}
	let wrongPassword = false;
	// Loop until a valid password or cancel (which rejects out of this function).
	for (;;) {
		const pw = await getPassword(wrongPassword);
		if ((await PdfDocument.passwordType(bytes, pw)) === null) {
			wrongPassword = true;
			continue;
		}
		try {
			return { bytes: await toPlaintext(bytes, pw), decrypted: true };
		} catch {
			// Defensive: treat any decrypt failure as a wrong password and re-prompt.
			wrongPassword = true;
		}
	}
}
