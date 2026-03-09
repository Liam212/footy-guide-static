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
