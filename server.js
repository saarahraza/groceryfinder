import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFlyerScrape } from "./scripts/scrape-flyers.js";
import { runShoppingAgent } from "./scripts/run-agent.js";
import { universalProductSearch } from "./src/product-pipeline.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = await createApp();
const port = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
const optimizedPath = path.join(dataDir, "optimized_list.json");
const scrapedPath = path.join(dataDir, "scraped_deals.json");

let status = {
  active: false,
  phase: "idle",
  updatedAt: new Date().toISOString(),
  error: null,
  timeline: []
};

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

app.get("/api/status", (_req, res) => {
  res.json(status);
});

app.get("/api/deals", async (_req, res) => {
  res.json(await readJson(scrapedPath, []));
});

app.get("/api/optimized-list", async (_req, res) => {
  res.json(await readJson(optimizedPath, null));
});

app.post("/api/clear-list", async (_req, res) => {
  await Promise.all([
    fs.rm(optimizedPath, { force: true }),
    fs.rm(scrapedPath, { force: true })
  ]);
  status = {
    active: false,
    phase: "idle",
    updatedAt: new Date().toISOString(),
    error: null,
    timeline: []
  };
  res.json({ ok: true });
});

app.get("/api/global-search", async (req, res) => {
  const query = req.query?.query || req.query?.q;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  try {
    res.json(await universalProductSearch({ query, postalCode: req.query?.postalCode || "L6H" }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/resolve-product", async (req, res) => {
  const sourceUrl = req.query?.url;
  const query = req.query?.query || "";
  if (!sourceUrl || !isSafeHttpUrl(sourceUrl)) {
    res.status(400).json({ error: "A valid product source URL is required." });
    return;
  }

  try {
    res.json({ sourceUrl, resolvedUrl: sourceUrl, exact: false });
  } catch (error) {
    res.json({ sourceUrl, resolvedUrl: sourceUrl, exact: false, warning: error.message });
  }
});

app.post("/api/run-agent", async (req, res) => {
  if (status.active) {
    res.status(409).json({ error: "Shopping agent is already running." });
    return;
  }

  const wantedItems = Array.isArray(req.body?.wantedItems) && req.body.wantedItems.length
    ? req.body.wantedItems
    : ["chicken breast", "milk", "eggs", "bananas", "rice", "yogurt"];
  const postalCode = req.body?.postalCode || "L6H";
  const mode = req.body?.mode || "cheapest";

  status = {
    active: true,
    phase: "scraping",
    updatedAt: new Date().toISOString(),
    error: null,
    timeline: [
      {
        step: "start",
        message: `Starting ${wantedItems.length} item search for ${postalCode}.`,
        at: new Date().toISOString()
      }
    ]
  };
  res.status(202).json({ ok: true, status });

  runShoppingPipeline({ postalCode, wantedItems, mode }).catch((error) => {
    status = {
      active: false,
      phase: "error",
      updatedAt: new Date().toISOString(),
      error: error.message,
      timeline: [
        ...(status.timeline || []),
        { step: "error", message: error.message, at: new Date().toISOString() }
      ]
    };
  });
});

async function runShoppingPipeline({ postalCode, wantedItems, mode }) {
  await fs.mkdir(dataDir, { recursive: true });
  pushProgress("scraping", "Checking product identity caches and live sources.");
  const scrapedData = await runFlyerScrape({
    postalCode,
    wantedItems,
    outputPath: scrapedPath,
    onProgress: (event) => pushProgress(event.step || "router", event.message || "Router step complete.")
  });

  pushProgress("optimizing", "Normalizing units, savings, and store grouping.");
  await runShoppingAgent({ scrapedData, wantedItems, mode, outputPath: optimizedPath });

  status = {
    active: false,
    phase: "complete",
    updatedAt: new Date().toISOString(),
    error: null,
    timeline: [
      ...(status.timeline || []),
      { step: "complete", message: "Optimized shopping path is ready.", at: new Date().toISOString() }
    ]
  };
}

function pushProgress(step, message) {
  const entry = { step, message, at: new Date().toISOString() };
  status = {
    ...status,
    phase: step === "optimizing" ? "optimizing" : "scraping",
    updatedAt: entry.at,
    timeline: [...(status.timeline || []), entry].slice(-12)
  };
}

async function resolveExactProductUrl(sourceUrl, query) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const origin = new URL(sourceUrl).origin;
    const wantedTerms = normalizeTerms(query);
    const links = await page.evaluate(() => Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => ({
        href: anchor.href,
        text: anchor.textContent?.replace(/\s+/g, " ").trim() || "",
        aria: anchor.getAttribute("aria-label") || ""
      }))
      .filter((link) => link.href));

    const productLinks = links
      .filter((link) => isLikelyProductHref(link.href))
      .map((link) => ({
        ...link,
        score: scoreProductLink(`${link.text} ${link.aria} ${link.href}`, wantedTerms)
      }))
      .sort((a, b) => b.score - a.score);

    const best = productLinks.find((link) => link.score > 0) || productLinks[0];
    return best ? new URL(best.href, origin).toString() : sourceUrl;
  } finally {
    await browser.close();
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return import("/Users/saarahraza/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs");
  }
}

function isLikelyProductHref(href) {
  return /\/p\/|\/product\/|\/ip\/|productId=|sku=|upc=/i.test(href);
}

function scoreProductLink(value, wantedTerms) {
  const normalized = normalizeTerms(value);
  return wantedTerms.filter((term) => normalized.includes(term)).length;
}

function normalizeTerms(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2);
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

app.listen(port, () => {
  console.log(`Flyer-to-Bento agent running at http://localhost:${port}`);
});

async function createApp() {
  try {
    const { default: express } = await import("express");
    const expressApp = express();
    expressApp.use(express.json());
    expressApp.use(express.static(path.join(__dirname, "public")));
    return expressApp;
  } catch {
    return createMiniApp(path.join(__dirname, "public"));
  }
}

function createMiniApp(publicDir) {
  const routes = { GET: new Map(), POST: new Map() };
  const appLike = {
    use() {},
    get(route, handler) {
      routes.GET.set(route, handler);
    },
    post(route, handler) {
      routes.POST.set(route, handler);
    },
    listen(listenPort, callback) {
      return http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const handler = routes[req.method]?.get(url.pathname);
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (payload) => {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(payload));
        };

        if (handler) {
          req.query = Object.fromEntries(url.searchParams.entries());
          req.body = req.method === "POST" ? await readBody(req) : undefined;
          handler(req, res);
          return;
        }

        serveStatic(publicDir, url.pathname, res);
      }).listen(listenPort, callback);
    }
  };
  return appLike;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function serveStatic(publicDir, pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(publicDir, cleanPath);
  if (!filePath.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  try {
    const file = await fs.readFile(filePath);
    res.setHeader("content-type", contentType(filePath));
    res.end(file);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".json")) return "application/json";
  return "text/html";
}
