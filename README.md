# footy-guide-static

Static frontend for Where Is Match.

## Local development

This repo now uses `Vite` for local development. You do not need Docker to work on the frontend.

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Configure the API

Create a local env file:

```bash
cp .env.example .env.local
```

Choose one of these options in `.env.local`:

```bash
VITE_API_URL=https://api.example.com
```

Use this when the API already allows browser requests from your local dev origin.

```bash
VITE_API_PROXY_TARGET=https://api.example.com
```

Use this when you want the Vite dev server to proxy `/proxy/*` requests to the API and avoid CORS issues.

If both are set, `VITE_API_URL` is used first.

### Start the dev server

```bash
npm run dev
```

Default local URL:

```text
http://localhost:5173/
```

Vite provides hot reloading for JavaScript and CSS. HTML page edits trigger a full page reload.

## Local SEO page generation

You can generate the SEO landing pages locally before starting the dev server.

### Generate pages

```bash
VITE_API_URL=https://api.example.com npm run seo:generate
```

Or, if you prefer to use the local Vite proxy target:

```bash
VITE_API_PROXY_TARGET=https://api.example.com npm run seo:generate
```

This script writes generated landing pages into the working tree and updates `sitemap.xml`.

### Clean generated SEO pages

```bash
npm run seo:clean
```

This restores files touched by the last SEO generation run and removes pages that were created by that run.

Run the clean script before generating again if you want to return the working tree to its pre-generation state.

### Generate then start Vite

```bash
VITE_API_URL=https://api.example.com npm run dev:seo
```

This command runs the SEO cleanup step first, then regenerates the pages, then starts Vite.

The generator accepts these env vars, in this order:

1. `API_URL`
2. `VITE_API_URL`
3. `VITE_API_PROXY_TARGET`

Use `API_URL` if you want to keep the SEO generator completely separate from your Vite config.

## Production build with Vite

To generate a static build locally:

```bash
npm run build
```

Preview that build with:

```bash
npm run preview
```

## Docker production deployment

Docker remains the production deployment path. The container still serves the built site from `nginx`, and HTML env placeholders are still injected with `envsubst`.

### Build

```bash
docker build \
  --build-arg API_URL=https://api.example.com \
  --build-arg ENVIROMENT=production \
  --build-arg POSTHOG_KEY=your_posthog_key \
  --build-arg POSTHOG_HOST=https://us.i.posthog.com \
  -t footy-guide-static .
```

Notes:

- `API_URL` is required for the Docker build by default because SEO page generation runs during image build.
- If you want to skip SEO page generation for a build, set `--build-arg SEO_GENERATE=0`.

### Run

```bash
docker run --rm -p 8080:80 footy-guide-static
```

Then open:

```text
http://localhost:8080/
```

## How config resolution works

The app resolves its API config in this order:

1. `VITE_API_URL` from Vite env
2. `window.FOOTY_CONFIG.apiUrl` injected into HTML for Docker production
3. `/proxy`

That keeps local Vite development and the existing Docker deployment flow compatible.
