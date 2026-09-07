/* Mobile diagnosis for "Create group" — emulates a phone (touch enabled),
   captures console output, page errors, network requests to /api/groups, and
   the resulting navigation. Pure diagnosis: changes nothing. */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});
const page = await browser.newPage();

// iPhone 13-ish viewport with touch
await page.setViewport({
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const consoleLogs = [];
page.on("console", (msg) => consoleLogs.push(`[console.${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => consoleLogs.push(`[pageerror] ${err.message}`));

const requests = [];
page.on("request", (req) => {
  if (req.url().includes("/api/")) requests.push(`>> ${req.method()} ${req.url()}`);
});
page.on("response", async (res) => {
  if (res.url().includes("/api/")) {
    let body = "";
    try {
      body = (await res.text()).slice(0, 200);
    } catch {}
    requests.push(`<< ${res.status()} ${res.url()} ${body}`);
  }
});

await page.goto(BASE + "/", { waitUntil: "networkidle2" });

// Instrument: log whether listeners fire (tap vs click handling)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Create group")
  );
  if (!btn) return "NO CREATE BUTTON FOUND";
  const form = btn.closest("form");
  ["pointerdown", "touchstart", "click", "submit"].forEach((ev) => {
    (ev === "submit" ? form : btn).addEventListener(ev, (e) =>
      console.log(`EVENT FIRED on mobile: ${ev}`)
    );
  });
  return null;
});

// Type group name like a user would
await page.type('input[placeholder="e.g. Team Alpha"]', "Mobile Test Group", { delay: 20 });

const btnInfo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Create group")
  );
  const r = btn.getBoundingClientRect();
  return {
    disabled: btn.disabled,
    text: btn.textContent.trim(),
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    inputStyled: getComputedStyle(document.querySelector('input')).color,
  };
});
console.log("BUTTON STATE:", JSON.stringify(btnInfo));

// Tap the button with a real touch tap
const tap = await page.tap("form button[type=submit]");
await new Promise((r) => setTimeout(r, 4000));

const after = await page.evaluate(() => ({
  url: location.pathname,
  urlValid: /^\/group\/[a-z0-9]+$/.test(location.pathname),
  h1: document.querySelector("h1")?.textContent ?? null,
}));

console.log("=== RESULT ===");
console.log("URL after tap:", after.url, "| valid group page:", after.urlValid);
console.log("Page h1:", after.h1);
console.log("=== EVENTS ===");
consoleLogs.filter((l) => l.includes("EVENT FIRED")).forEach((l) => console.log(l));
console.log("=== API CALLS ===");
requests.forEach((l) => console.log(l));
console.log("=== CONSOLE (all) ===");
consoleLogs.filter((l) => !l.includes("EVENT FIRED")).forEach((l) => console.log(l));

await browser.close();
