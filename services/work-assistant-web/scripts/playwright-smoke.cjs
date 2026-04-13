const fs = require("fs");
const path = require("path");

const { chromium } = require("playwright");

const baseUrl = process.argv[2] || "https://work-assistant-web-production.up.railway.app";
const password = process.argv[3] || "";
const screenshotDir = process.argv[4] || "/tmp/ojeai-playwright-smoke";

if (!password) {
  console.error("Usage: node playwright-smoke.cjs <baseUrl> <password> [screenshotDir]");
  process.exit(1);
}

fs.mkdirSync(screenshotDir, { recursive: true });

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    fullPage: true,
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });

  const pageErrors = [];
  const consoleErrors = [];
  const failedResponses = [];

  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 },
  });
  const page = await context.newPage();

  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      const source =
        location && location.url
          ? ` [${location.url}${location.lineNumber ? `:${location.lineNumber}` : ""}]`
          : "";
      consoleErrors.push(`${message.text()}${source}`);
    }
  });

  page.on("response", async (response) => {
    if (response.status() >= 400) {
      failedResponses.push(
        `${response.status()} ${response.request().resourceType()} ${response.url()}`,
      );
    }
  });

  const visited = [];

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('input[name="password"]', { timeout: 10000 });
    await screenshot(page, "01-login");
    visited.push("/login");

    await page.fill('input[name="password"]', password);
    await Promise.all([
      page.waitForURL(/\/overview$/, { timeout: 30000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForLoadState("networkidle");
    await screenshot(page, "02-overview");
    visited.push("/overview");

    const routes = [
      { href: "/mailbox", name: "03-mailbox" },
      { href: "/cerebro", name: "04-cerebro" },
      { href: "/copilot", name: "05-copilot" },
      { href: "/tasks", name: "06-tasks" },
      { href: "/schedule", name: "07-schedule" },
      { href: "/knowledge", name: "08-knowledge" },
      { href: "/meetings", name: "09-meetings" },
      { href: "/operations", name: "10-operations" },
      { href: "/overview", name: "11-overview-return" },
    ];

    for (const route of routes) {
      await Promise.all([
        page.waitForURL(new RegExp(`${route.href.replace("/", "\\/")}$`), { timeout: 30000 }),
        page.click(`a[href="${route.href}"]`),
      ]);
      await page.waitForLoadState("networkidle");
      await screenshot(page, route.name);
      visited.push(route.href);
    }

    const summary = {
      baseUrl,
      visited,
      pageErrors,
      consoleErrors,
      failedResponses,
      screenshotDir,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (pageErrors.length || consoleErrors.length || failedResponses.length) {
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
