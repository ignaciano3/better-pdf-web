import type { RequestHandler } from './$types';

// Served dynamically so the Sitemap line points at the real request origin
// (works across preview and production without a hardcoded domain).
export const GET: RequestHandler = ({ url }) => {
	const body = `# allow crawling everything by default
User-agent: *
Allow: /

# app & auth routes — thin/non-indexable
Disallow: /editor
Disallow: /login
Disallow: /signup
Disallow: /admin

Sitemap: ${url.origin}/sitemap.xml
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
};
