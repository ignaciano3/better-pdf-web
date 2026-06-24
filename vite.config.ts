import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

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
	],
	test: {
		expect: { requireAssertions: true },
		// Dummy values so the SvelteKit server graph (auth/db) loads under test.
		// Unit tests here never open a real connection.
		env: {
			DATABASE_URL: 'postgres://test:test@localhost:5432/test',
			BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-32',
			BETTER_AUTH_URL: 'http://localhost:5173'
		},
		projects: [
			{
				extends: './vite.config.ts',
				// Use browser builds of packages under test (official Svelte guidance).
				resolve: { conditions: ['browser'] },
				test: {
					name: 'client',
					environment: 'jsdom',
					// Register @testing-library/svelte's automatic post-test DOM cleanup.
					globals: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
