/* Verify typed input text color on all <input>/<textarea> elements at mobile
   and desktop widths; capture screenshots with text typed in. */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox"],
});

const results = [];

for (const vp of [
  { name: "mobile-390", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "desktop-1280", width: 1280, height: 800, isMobile: false, hasTouch: false },
]) {
  const page = await browser.newPage();
  await page.setViewport(vp);

  // Landing page inputs
  await page.goto(BASE + "/", { waitUntil: "networkidle2" });
  await page.type('input[placeholder="e.g. Team Alpha"]', "Dark text check", { delay: 5 });
  await page.type('input[placeholder="Paste group slug or link"]', "abc123", { delay: 5 });
  const landing = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea")].map((el) => ({
      tag: el.tagName,
      placeholder: el.placeholder,
      color: getComputedStyle(el).color,
      bg: getComputedStyle(el).backgroundColor,
    }))
  );
  await page.screenshot({ path: `shot-landing-${vp.name}.png` });

  // Dashboard textareas (join the group created earlier)
  await page.goto(BASE + "/group/94b9763213", { waitUntil: "networkidle2" });
  const areas = await page.$$("main textarea");
  await areas[0].type("AI prompt contrast check", { delay: 5 });
  await areas[1].type("Note contrast check", { delay: 5 });
  const dash = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea")].map((el) => ({
      tag: el.tagName,
      placeholder: el.placeholder?.slice(0, 40),
      color: getComputedStyle(el).color,
      bg: getComputedStyle(el).backgroundColor,
    }))
  );
  await page.screenshot({ path: `shot-dash-${vp.name}.png` });

  results.push({ viewport: vp.name, landing, dash });
  await page.close();
}

for (const r of results) {
  console.log(`\n=== ${r.viewport} ===`);
  for (const el of [...r.landing, ...r.dash]) {
    console.log(
      `${el.tag.padEnd(9)} "${(el.placeholder ?? "").slice(0, 38).padEnd(38)}" color=${el.color} on ${el.bg}`
    );
  }
}
await browser.close();
