import { chromium } from "patchright";
async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("https://www.naukri.com/developer-jobs-in-india");
  await page.waitForTimeout(3000);
  const html = await page.content();
  console.log("HTML length:", html.length);
  const titles = await page.$$eval(".title, a.title, .jobTitle, [class*='title']", els => els.map(e => e.textContent));
  console.log("Titles found:", titles.length, titles.slice(0, 3));
  await browser.close();
}
run();
