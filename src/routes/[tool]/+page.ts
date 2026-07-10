import { error } from '@sveltejs/kit';
import { getTool, TOOLS } from '$lib/seo/tools';
import type { EntryGenerator, PageLoad } from './$types';

// Prerendered at build time — one static HTML file per registry entry. The
// root layout's server load runs at build with no cookies, so these pages
// bake in a logged-out header; the root layout recovers a signed-in session
// client-side after hydration (see +layout.svelte).
export const prerender = true;

export const entries: EntryGenerator = () => TOOLS.map((t) => ({ tool: t.slug }));

export const load: PageLoad = ({ params }) => {
	const tool = getTool(params.tool);
	if (!tool) error(404, 'Not found');
	return { tool };
};
