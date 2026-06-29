# better-pdf-web

A client-heavy, server-gated visual PDF editor (Sejda-like) that lets anyone fill, edit, sign, and assemble PDFs directly in the browser. Interactive editing runs entirely client-side — free, fast, and with no server cost — while only finalize/export and heavy operations route through a server gate (identity → plan → rate-check → finalize).

The app also dogfoods [`@ignaciano3/better-pdf`](https://www.npmjs.com/package/@ignaciano3/better-pdf), serving as a live demo of the library.

## Features

- Fill and flatten PDF AcroForm fields (text, checkbox, radio, dropdown)
- Draw text, images, polygons, and vector shapes onto pages
- Visual signatures via an in-browser signature pad
- Page management: add, insert, remove, reorder, rotate, and resize pages
- Merge, split, and assemble documents
- Document metadata and outline/bookmark editing
- Watermarks
- Freemium funnel: anonymous → registered free → Pro, with no watermarks on the free tier

## Tech stack

- **Framework:** [SvelteKit](https://svelte.dev/docs/kit) 2 + Svelte 5
- **Styling:** Tailwind CSS 4
- **PDF engine:** [`@ignaciano3/better-pdf`](https://www.npmjs.com/package/@ignaciano3/better-pdf) + [`pdfjs-dist`](https://github.com/mozilla/pdf.js) for rendering
- **Auth:** [Better Auth](https://www.better-auth.com/) (email + optional Google OAuth)
- **Database:** PostgreSQL via [Drizzle ORM](https://orm.drizzle.team/)
- **Billing:** [Lemon Squeezy](https://www.lemonsqueezy.com/) (merchant of record)
- **Hosting:** Netlify (serverless functions + Neon Postgres)

## Getting started

This project uses [Bun](https://bun.sh/).

### 1. Install dependencies

```sh
bun install
```

### 2. Configure environment

Copy the example env file and fill in the values:

```sh
cp .env.example .env
```

At minimum you need a `DATABASE_URL` and a `BETTER_AUTH_SECRET` (generate one with `npx auth secret`). Google OAuth and Lemon Squeezy billing are optional — see the comments in `.env.example` for details.

### 3. Start Postgres

A local Postgres is provided via Docker Compose:

```sh
bun run db:start
```

### 4. Run migrations

```sh
bun run db:migrate
```

### 5. Start the dev server

```sh
bun run dev

# or open the app in a new browser tab
bun run dev -- --open
```

## Scripts

| Script               | Description                        |
| -------------------- | ---------------------------------- |
| `bun run dev`        | Start the dev server               |
| `bun run build`      | Build for production               |
| `bun run preview`    | Preview the production build       |
| `bun run check`      | Type-check with `svelte-check`     |
| `bun run lint`       | Lint with Prettier + ESLint        |
| `bun run format`     | Format with Prettier               |
| `bun run test`       | Run unit tests (Vitest)            |
| `bun run e2e`        | Run end-to-end tests (Playwright)  |
| `bun run db:start`   | Start the local Postgres container |
| `bun run db:migrate` | Apply database migrations          |
| `bun run db:studio`  | Open Drizzle Studio                |

## Database

The database layer is managed with Drizzle. After changing the schema:

```sh
bun run db:generate   # generate a migration from schema changes
bun run db:migrate    # apply migrations
bun run db:studio     # browse data in Drizzle Studio
```

For deployment, `DATABASE_URL` should point at Neon's **pooled** endpoint for the runtime, while migrations and seeding run against the **direct** endpoint — see `.env.example` for the full explanation.

## Testing

- **Unit:** `bun run test` (Vitest)
- **E2E:** `bun run e2e` (Playwright)

## Project docs

- [`PRODUCT.md`](./PRODUCT.md) — product purpose, users, and brand
- [`DESIGN.md`](./DESIGN.md) — design system and principles
- [`FEATURES.MD`](./FEATURES.MD) — feature log
