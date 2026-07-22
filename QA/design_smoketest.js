const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, "QA", "artifacts", "design-smoke");
const PORT = Number(process.env.DESIGN_SMOKE_PORT || 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
];

const PAGES = [
  { name: "home", path: "/index.html", required: ["#account-button", "#results-grid", "#cinema-showtimes-section"] },
  { name: "saved", path: "/saved.html", required: ["#account-button", "#saved-films-list"] },
  { name: "privacy", path: "/privacy.html", required: [".privacy-card", "h1"] },
];

function pass(label) {
  console.log(`PASS  ${label}`);
}

function warn(label) {
  console.log(`WARN  ${label}`);
}

function fail(label) {
  throw new Error(label);
}

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), "utf8");
}

function assertStaticDesignRules() {
  const css = read("styles.css");
  const app = read("app.js");
  const designDoc = read("docs/design-system.md");

  let balance = 0;
  let minBalance = 0;
  for (const char of css) {
    if (char === "{") balance += 1;
    if (char === "}") balance -= 1;
    minBalance = Math.min(minBalance, balance);
  }

  if (balance !== 0 || minBalance < 0) {
    fail(`styles.css has unbalanced braces: balance=${balance}, min=${minBalance}`);
  }
  pass("CSS braces are balanced");

  [
    "--control-height",
    "--control-height-compact",
    "--control-padding-x",
    "--radius-lg",
    "--accent",
  ].forEach((token) => {
    if (!css.includes(token)) {
      fail(`Missing design token ${token}`);
    }
  });
  pass("Required design tokens exist");

  // Small negative letter-spacing on headings/display type is intentional; only
  // flag excessively tight tracking (tighter than -0.05em / -0.05rem, or -0.5px).
  const tightTracking = [...css.matchAll(/letter-spacing:\s*(-?[0-9.]+)(em|rem|px)/g)]
    .map((match) => ({ value: parseFloat(match[1]), unit: match[2] }))
    .filter((entry) => (entry.unit === "px" ? entry.value < -0.5 : entry.value < -0.05));
  if (tightTracking.length) {
    fail("Excessively tight letter-spacing (< -0.05em) found; keep heading tracking modest");
  }
  pass("Letter-spacing within range (small negative heading tracking allowed)");

  if (/white-space:\s*nowrap/.test(css)) {
    fail("nowrap found; controls and headings must be allowed to wrap");
  }
  pass("No nowrap rules that can force text overflow");

  if (!/overflow-wrap:\s*anywhere/.test(css)) {
    fail("Missing overflow-wrap guardrail");
  }
  pass("Text overflow guardrail exists");

  if (/Read-only preview|Personal actions unlock/.test(app)) {
    fail("Logged-out explanatory panel copy has returned");
  }
  pass("Removed logged-out explanatory panel remains absent");

  if (!designDoc.includes("Supported QA Viewports")) {
    fail("Design system doc is missing QA viewport contract");
  }
  pass("Design system doc is present");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    if (process.env.DESIGN_SMOKE_REQUIRE_BROWSER === "1") {
      fail("Playwright package is unavailable but DESIGN_SMOKE_REQUIRE_BROWSER=1");
    }
    warn("Playwright package is unavailable; browser screenshot checks skipped");
    return null;
  }
}

async function startServer() {
  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: ROOT,
    stdio: "ignore",
  });

  await wait(800);
  return server;
}

async function runBrowserChecks() {
  const playwright = await importPlaywright();
  if (!playwright) {
    return;
  }

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const server = await startServer();
  let browser;

  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    warn("Playwright browser binary is missing; run `npx playwright install chromium` to enable screenshot checks");
    server.kill();
    if (process.env.DESIGN_SMOKE_REQUIRE_BROWSER === "1") {
      fail(error.message);
    }
    return;
  }

  try {
    for (const pageSpec of PAGES) {
      for (const viewport of VIEWPORTS) {
        const page = await browser.newPage({ viewport });
        const consoleMessages = [];
        page.on("console", (message) => {
          if (["error", "warning"].includes(message.type())) {
            consoleMessages.push(`${message.type()}: ${message.text()}`);
          }
        });
        page.on("pageerror", (error) => {
          consoleMessages.push(`pageerror: ${error.message}`);
        });

        await page.goto(`${BASE_URL}${pageSpec.path}`, { waitUntil: "networkidle" });

        if (pageSpec.name === "home") {
          await page.click("#account-button");
          await page.waitForSelector(".account-auth-dialog", { timeout: 3000 });
        }

        const result = await page.evaluate((requiredSelectors) => {
          const width = window.innerWidth;
          const documentWidth = document.documentElement.scrollWidth;
          const missing = requiredSelectors.filter((selector) => !document.querySelector(selector));
          const candidates = Array.from(
            document.querySelectorAll("button, a, input, .card, .result-card, .saved-film-row, .account-auth-dialog, h1, h2, h3, p")
          );
          const overflow = candidates
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
            })
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              const text = (element.textContent || element.value || "").trim().replace(/\s+/g, " ");
              const overflowsX = element.scrollWidth > element.clientWidth + 2 && style.overflowX === "visible";
              const offscreen = rect.left < -1 || rect.right > width + 1;
              const tinyButton = element.matches("button, a.card-link-button, .ghost-button, .account-button") && rect.height < 34;
              if (!overflowsX && !offscreen && !tinyButton) {
                return null;
              }
              return {
                tag: element.tagName.toLowerCase(),
                className: element.className,
                text: text.slice(0, 90),
                overflowsX,
                offscreen,
                tinyButton,
                rect: {
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                },
              };
            })
            .filter(Boolean)
            .slice(0, 20);

          return {
            documentWidth,
            viewportWidth: width,
            missing,
            overflow,
          };
        }, pageSpec.required);

        const label = `${pageSpec.name} ${viewport.name}`;
        if (result.documentWidth > result.viewportWidth + 1) {
          fail(`${label}: horizontal document overflow ${result.documentWidth} > ${result.viewportWidth}`);
        }
        if (result.missing.length) {
          fail(`${label}: missing selectors ${result.missing.join(", ")}`);
        }
        if (result.overflow.length) {
          fail(`${label}: ${JSON.stringify(result.overflow, null, 2)}`);
        }
        if (consoleMessages.length) {
          fail(`${label}: console issues ${consoleMessages.join(" | ")}`);
        }

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `${pageSpec.name}-${viewport.name}.png`),
          fullPage: true,
        });
        await page.close();
        pass(`${label} browser layout check`);
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

async function main() {
  console.log("Running design smoke test...");
  console.log("");
  assertStaticDesignRules();
  await runBrowserChecks();
  console.log("");
  console.log("Design smoke test complete.");
}

main().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exit(1);
});
