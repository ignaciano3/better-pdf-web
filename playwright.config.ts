import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Load `.env` (gitignored) so global setup can reach Postgres and the preview
// server gets DATABASE_URL/auth secrets. No dotenv dependency: parse the file
// directly and only fill vars that aren't already set in the environment.
try {
	for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
		const match = /^\s*([\w.]+)\s*=\s*(.*)\s*$/.exec(line);
		if (!match) continue;
		const key = match[1];
		const value = match[2].replace(/^["']|["']$/g, '');
		if (process.env[key] === undefined) process.env[key] = value;
	}
} catch {
	// No .env file; rely on the ambient environment.
}

/**
 * Playwright config for better-pdf-web e2e.
 *
 * - Specs live in `e2e/` (OUTSIDE `src/`) so the vitest `include: ['src/**']`
 *   never picks them up.
 * - `webServer` builds the app and serves the production preview, exercising
 *   the real SvelteKit remote-function export path (the dev server's HMR/async
 *   transforms are avoided for a more deterministic export gate).
 * - A global setup TRUNCATEs `usage_event` so the anonymous rate-limit window
 *   starts empty on every run; specs additionally use a unique fingerprint.
 */
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './e2e',
	globalSetup: './e2e/global-setup.ts',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: 'list',
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: 'bun run build && bun run preview --port ' + PORT + ' --host 127.0.0.1',
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
