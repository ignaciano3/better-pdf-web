import { describe, it, expect } from 'vitest';
import { DRAW_SHORTCUTS, SHORTCUT_TO_DRAW, SELECT_SHORTCUT } from './constants';

describe('tool keyboard shortcuts', () => {
	it('round-trips between kind→key and key→kind', () => {
		for (const [kind, key] of Object.entries(DRAW_SHORTCUTS)) {
			expect(SHORTCUT_TO_DRAW[key!]).toBe(kind);
		}
	});

	it('assigns a unique key to every shortcut, including select', () => {
		const keys = [...Object.values(DRAW_SHORTCUTS), SELECT_SHORTCUT];
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('uses only single lowercase letters', () => {
		for (const key of [...Object.values(DRAW_SHORTCUTS), SELECT_SHORTCUT]) {
			expect(key).toMatch(/^[a-z]$/);
		}
	});

	it('does not bind the image tool (it needs a file picker)', () => {
		expect(DRAW_SHORTCUTS.image).toBeUndefined();
	});
});
