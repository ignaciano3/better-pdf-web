import { describe, it, expect } from 'vitest';
import { TOOLS, getTool, isToolPath } from './tools';

const VALID_OPERATIONS = ['fill', 'sign', 'merge', 'split', 'watermark', 'edit'];

describe('TOOLS registry', () => {
	it('has exactly the six v1 tools', () => {
		expect(TOOLS.map((t) => t.slug).sort()).toEqual([
			'edit-pdf',
			'fill-pdf-form',
			'merge-pdf',
			'sign-pdf',
			'split-pdf',
			'watermark-pdf'
		]);
	});

	it('has unique, URL-safe slugs', () => {
		const slugs = TOOLS.map((t) => t.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
	});

	it('every entry has a valid operation and complete copy', () => {
		for (const t of TOOLS) {
			expect(VALID_OPERATIONS).toContain(t.operation);
			expect(t.title.length).toBeGreaterThan(10);
			expect(t.metaDescription.length).toBeGreaterThan(50);
			expect(t.metaDescription.length).toBeLessThanOrEqual(170);
			expect(t.h1.length).toBeGreaterThan(5);
			expect(t.heroCopy.length).toBeGreaterThan(50);
			expect(t.cardBlurb.length).toBeGreaterThan(10);
			expect(t.steps).toHaveLength(3);
			for (const s of t.steps) {
				expect(s.title.length).toBeGreaterThan(2);
				expect(s.text.length).toBeGreaterThan(20);
			}
			expect(t.faq.length).toBeGreaterThanOrEqual(4);
			expect(t.faq.length).toBeLessThanOrEqual(6);
			for (const f of t.faq) {
				expect(f.q.length).toBeGreaterThan(5);
				expect(f.a.length).toBeGreaterThan(20);
			}
		}
	});

	it('never claims files do not leave the browser', () => {
		// Uploads and exports DO send bytes to the server; this claim is banned.
		const all = JSON.stringify(TOOLS).toLowerCase();
		expect(all).not.toContain('never leave your browser');
		expect(all).not.toContain('never leaves your browser');
		expect(all).not.toContain('never sent to a server');
		expect(all).not.toContain('never uploaded');
	});

	it('getTool finds known slugs and rejects unknown ones', () => {
		expect(getTool('merge-pdf')?.operation).toBe('merge');
		expect(getTool('nope')).toBeUndefined();
	});

	it('isToolPath matches tool paths only', () => {
		expect(isToolPath('/merge-pdf')).toBe(true);
		expect(isToolPath('/pricing')).toBe(false);
		expect(isToolPath('/')).toBe(false);
		expect(isToolPath('/merge-pdf/extra')).toBe(false);
	});
});
