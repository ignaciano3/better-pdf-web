import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				// Required by SvelteKit remote functions (experimental).
				experimental: { async: true }
			},

			// Experimental: type-safe server RPC via `.remote.ts` (query/form/command/prerender).
			// Used for the export gate and rate-limit checks instead of hand-rolled API routes.
			experimental: { remoteFunctions: true },

			adapter: adapter()
		})
	]
});
