# n8n Playwright HTTP Request

A lightweight Playwright-based HTTP server that renders JavaScript-heavy pages and returns their HTML. Designed to run alongside a self-hosted [n8n](https://n8n.io) instance as a drop-in solution for scraping pages that require a real browser.

## Why?

n8n's built-in HTTP Request node has its limitations- no js execution, easily detected by anti scraper techniques

## Features

- **Headless WebKit** — lightweight alternative to Chromium
- **Anti-bot stealth** — spoofed user agent, navigator properties, and canvas fingerprinting
- **Concurrency limiting** — caps parallel browser contexts to avoid CPU spikes
- **Optional JS evaluation** — run arbitrary JavaScript on the page and get the result back
- **Resource blocking** — skips images, fonts, stylesheets, and media for faster responses
- **Docker ready** — single container, connects to your existing n8n Docker network

## Quick Start (Docker)

### 1. Clone and build

```bash
git clone https://github.com/raymond8505/n8n-playwright-http-request.git
cd n8n-playwright-http-request/server
docker build -t playwright-scraper .
```

### 2. Run on the same Docker network as n8n

```bash
docker run -d \
  --name playwright-scraper \
  --network n8n_default \
  playwright-scraper
```

> Replace `n8n_default` with whatever Docker network your n8n container is on. Find it with `docker network ls`.

### 3. Verify it's running

```bash
docker exec playwright-scraper curl -s http://localhost:3000/health
# {"status":"ok"}
```

## Using in n8n

In your n8n workflow, add an **HTTP Request** node with these settings:

| Setting | Value |
|---------|-------|
| Method | `POST` |
| URL | `http://playwright-scraper:3000/fetch` |
| Body Content Type | JSON |

### Basic request body

```json
{
  "url": "https://example.com"
}
```

### Full request body (all options)

```json
{
  "url": "https://example.com",
  "waitUntil": "domcontentloaded",
  "timeout": 30000,
  "js": "document.title"
}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | *required* | The URL to render |
| `waitUntil` | string | `"domcontentloaded"` | When to consider navigation complete. Options: `"load"`, `"domcontentloaded"`, `"networkidle"` |
| `timeout` | number | `30000` | Navigation timeout in milliseconds |
| `js` | string | — | JavaScript to evaluate on the page after load. Supports expressions (`document.title`) and functions (`() => window._initialData`) |

### Response

```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "html": "<!doctype html>...",
  "jsResult": "Example Domain",
  "status": "success"
}
```

- `html` — the fully rendered page HTML
- `jsResult` — only present if `js` was provided in the request

## API

### `POST /fetch`

Render a URL and return the HTML. See parameters above.

### `GET /health`

Health check endpoint. Returns `{"status": "ok"}`.

## Deployment

Copy `deploy-server.bat.example` (Windows) or `deploy-server-local.sh.example` (Linux/Mac) and fill in your VPS details:

```bash
cp deploy-server-local.sh.example deploy-server-local.sh
# Edit deploy-server-local.sh with your VPS IP and credentials
```

## License

MIT
