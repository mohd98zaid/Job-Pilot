
import { runAIDiscovery } from "../src/services/ai-discovery.service.js";
import { logger } from "../src/lib/logger.js";

async function test() {
  console.log("Starting Discovery Test...");
  
  const results = await runAIDiscovery(
    {
      role: "Gen AI",
      region: "Dubai",
      dateFilter: "any",
      maxResults: 10
    },
    (p) => {
      if (p.type === "log") {
        console.log(`[${p.level?.toUpperCase()}] ${p.message}`);
      } else if (p.type === "job") {
        console.log(`[JOB] Found: ${p.job?.title} at ${p.job?.company}`);
      }
    }
  );

  console.log(`Test Finished. Total results: ${results.length}`);
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
