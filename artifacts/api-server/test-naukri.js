import { scrapeNaukri } from "./src/services/scrapers/naukri.scraper.js";

async function run() {
  const jobs = await scrapeNaukri({ role: "developer", region: "india", sources: ["Naukri"] }, console.log, console.log);
  console.log("Found jobs:", jobs.length);
  process.exit(0);
}
run();
