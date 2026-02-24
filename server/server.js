const express = require("express");
const { webkit } = require("playwright");

const app = express();
app.use(express.json());

let browser = null;

// --- Concurrency limiter ---
// Cap concurrent renderer processes to avoid CPU spikes under load.
const MAX_CONCURRENT = 2;
let activePages = 0;
const waitQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    if (activePages < MAX_CONCURRENT) {
      activePages++;
      resolve();
    } else {
      waitQueue.push(resolve);
    }
  });
}

function releaseSlot() {
  if (waitQueue.length > 0) {
    waitQueue.shift()();
  } else {
    activePages--;
  }
}

// Initialize browser on startup
async function initBrowser() {
  browser = await webkit.launch({
    headless: true,
    // WebKit doesn't support most Chromium flags, so keep it minimal
  });
  console.log("Browser launched");
}

app.post("/fetch", async (req, res) => {
  const { url, waitUntil = "domcontentloaded", timeout = 30000, js } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL required" });
  }

  await acquireSlot();

  let context = null;
  try {
    context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/New_York",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "max-age=0",
        Pragma: "no-cache",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        Referer: "https://www.google.com/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
    });

    const page = await context.newPage();

    // Block images, fonts, stylesheets, and media — not needed for HTML extraction
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "font", "stylesheet", "media"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Enhanced stealth measures
    await page.addInitScript(() => {
      // Hide webdriver flag
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // Mock plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Hide headless mode - mock chrome object
      if (!window.chrome) {
        window.chrome = {};
      }
      window.chrome.runtime = undefined;

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (params) =>
        params.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(params);

      // Override the toString to hide headless
      Object.defineProperty(navigator, "vendor", {
        get: () => "Google Inc.",
      });

      Object.defineProperty(navigator, "platform", {
        get: () => "Win32",
      });

      // Mock canvas fingerprinting
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () {
        if (
          this.width === 280 &&
          this.height === 60 &&
          this.toDataURL === originalToDataURL
        ) {
          return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAA8CAYAAABvSEIQAAAA";
        }
        return originalToDataURL.apply(this, arguments);
      };
    });

    // Add random delay before navigation to appear more human-like
    const delay = Math.random() * 2000 + 500; // 500-2500ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    await page.goto(url, { waitUntil, timeout });
    const content = await page.content();
    const title = await page.title();

    let jsResult;
    if (js) {
      // If the string looks like a function expression, wrap it as an IIFE
      // so "() => window._initialData" becomes "(()=> window._initialData)()"
      const isFn = /^\s*(async\s+)?\(|^\s*async\s+\w|^\s*function[\s(]/.test(
        js,
      );
      const expr = isFn ? `(${js})()` : js;
      jsResult = await page.evaluate(expr);
    }

    res.json({
      url: page.url(),
      title,
      html: content,
      ...(js !== undefined && { jsResult }),
      status: "success",
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      url: req.body.url,
    });
  } finally {
    // Always close the context to release the renderer process, even on error
    if (context) await context.close();
    releaseSlot();
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

initBrowser()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Playwright server listening on ${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });

process.on("SIGTERM", async () => {
  console.log("Shutting down gracefully...");
  if (browser) await browser.close();
  process.exit(0);
});
