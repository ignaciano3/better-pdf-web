import { describe, it, expect } from 'vitest';
import { GET } from './+server';
import { TOOLS } from '$lib/seo/tools';

describe('sitemap.xml', () => {
	it('lists the static pages and every tool page', async () => {
		const res = (GET as (e: { url: URL }) => Response)({
			url: new URL('https://example.com/sitemap.xml')
		});
		const body = await res.text();
		expect(body).toContain('<loc>https://example.com/</loc>');
		expect(body).toContain('<loc>https://example.com/pricing</loc>');
		for (const t of TOOLS) {
			expect(body).toContain(`<loc>https://example.com/${t.slug}</loc>`);
		}
	});
});
