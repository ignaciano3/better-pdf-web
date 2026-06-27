import type { RequestHandler } from './$types';

// Public, indexable pages only. App/auth routes (/editor, /login, /signup,
// /admin) are intentionally excluded — they're noindex and robots-disallowed.
const PAGES = [
	{ path: '/', changefreq: 'weekly', priority: '1.0' },
	{ path: '/pricing', changefreq: 'monthly', priority: '0.8' }
];

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	const urls = PAGES.map(
		(p) => `	<url>
		<loc>${origin}${p.path}</loc>
		<changefreq>${p.changefreq}</changefreq>
		<priority>${p.priority}</priority>
	</url>`
	).join('\n');

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
};
