import { error } from '@sveltejs/kit';
import { getTool } from '$lib/seo/tools';
import type { PageLoad } from './$types';

// SSR (not prerendered): the root layout load resolves the signed-in user,
// so prerendering would bake a logged-out header into static HTML.
export const load: PageLoad = ({ params }) => {
	const tool = getTool(params.tool);
	if (!tool) error(404, 'Not found');
	return { tool };
};
