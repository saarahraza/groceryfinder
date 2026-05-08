# Flyer-to-Bento Shopping Agent

A local functional shopping-agent prototype for Oakville grocery deal hunting.

## What It Does

- Uses Playwright in `scripts/scrape-flyers.js` as the scraping eye.
- Writes flyer data to `data/scraped_deals.json`.
- Runs a Claude tool-use loop when `ANTHROPIC_API_KEY` is set.
- Falls back to a local deterministic optimizer when Claude or live scraping is unavailable.
- Writes `data/optimized_list.json`.
- Serves a live glassmorphism bento dashboard with skeleton loaders and an animated savings counter.
- Adds real outbound source links for store websites, flyer pages, product searches, and remote grocery product images.

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Modes

By default, the scraper uses realistic demo flyer data so the product works immediately.

Use live scraping with:

```bash
SCRAPER_MODE=live npm start
```

Use live Google Shopping through SerpApi with:

```bash
SERPAPI_KEY=your_key npm start
```

See `.env.example` for supported environment variables.

Use Claude tool calling with:

```bash
ANTHROPIC_API_KEY=your_key npm start
```

Optional model override:

```bash
CLAUDE_MODEL=claude-3-5-sonnet-latest npm start
```

## API

- `POST /api/run-agent`
- `GET /api/status`
- `GET /api/deals`
- `GET /api/optimized-list`
