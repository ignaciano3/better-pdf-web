import { describe, it, expect } from 'vitest';
import { load } from './+page';

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
