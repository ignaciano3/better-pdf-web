import { describe, it, expect } from 'vitest';
import { load, entries, prerender } from './+page';
import { TOOLS } from '$lib/seo/tools';

function loadFor(slug: string) {
	// Only `params` is read by this load function.
	return (load as (e: { params: { tool: string } }) => { tool: { slug: string } })({
		params: { tool: slug }
	});
}

describe('[tool] page load', () => {
	it('returns registry data for a known slug', () => {
		const data = loadFor('merge-pdf');
		expect(data.tool.slug).toBe('merge-pdf');
	});

	it('throws 404 for an unknown slug', () => {
		try {
			loadFor('not-a-tool');
			expect.unreachable('should have thrown');
		} catch (e) {
			expect((e as { status: number }).status).toBe(404);
		}
	});
});

describe('[tool] prerendering', () => {
	it('is marked prerenderable', () => {
		expect(prerender).toBe(true);
	});

	it('entries lists every registered tool exactly once', async () => {
		const bySlug = (a: { tool: string }, b: { tool: string }) => a.tool.localeCompare(b.tool);
		expect([...(await entries())].sort(bySlug)).toEqual(
			TOOLS.map((t) => ({ tool: t.slug })).sort(bySlug)
		);
	});
});
