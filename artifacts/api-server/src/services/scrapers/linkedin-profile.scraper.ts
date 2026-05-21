import { getBrowser, newStealthContext } from "./browser";

export interface LinkedInProfileData {
  name: string;
  currentRole: string;
  targetMarket: string;
  skills: string[];
  posts: string[];
}

export async function scrapeLinkedInFootprint(
  sessionId: string,
  onLog: (level: "info" | "warn" | "error", message: string) => void
): Promise<LinkedInProfileData> {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);

  onLog("info", "Injecting cookies...");
  const cookiesToInject = [];
  if (sessionId.includes("=")) {
    const pairs = sessionId.split(";");
    for (const pair of pairs) {
      const [name, ...rest] = pair.trim().split("=");
      if (name && rest.length > 0) {
        let value = rest.join("=");
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        cookiesToInject.push({ name: name.trim(), value, url: "https://www.linkedin.com", secure: true });
      }
    }
  } else {
    cookiesToInject.push({ name: "li_at", value: sessionId, url: "https://www.linkedin.com", secure: true });
  }
  await ctx.addCookies(cookiesToInject);

  const page = await ctx.newPage();

  const data: LinkedInProfileData = {
    name: "",
    currentRole: "",
    targetMarket: "",
    skills: [],
    posts: []
  };

  try {
    onLog("info", "Navigating to LinkedIn profile (https://www.linkedin.com/in/me/)...");
    try {
      await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e: any) {
      if (e.message.includes("ERR_TOO_MANY_REDIRECTS")) {
        throw new Error("Invalid session cookies. The provided cookies triggered a redirect loop. Try pasting the ENTIRE raw cookie string from your browser's network tab.");
      }
      throw e;
    }

    // Wait a bit to emulate human behavior
    await page.waitForTimeout(2000);

    // Extract basic profile info
    data.name = await page.evaluate(() => {
      const el = document.querySelector('h1.text-heading-xlarge');
      return el ? (el.textContent || "").trim() : "";
    }).catch(() => "");

    data.currentRole = await page.evaluate(() => {
      const el = document.querySelector('div.text-body-medium.break-words');
      return el ? (el.textContent || "").trim() : "";
    }).catch(() => "");

    data.targetMarket = await page.evaluate(() => {
      const el = document.querySelector('span.text-body-small.inline.t-black--light.break-words');
      return el ? (el.textContent || "").trim() : "";
    }).catch(() => "");

    onLog("info", `Extracted basic profile: ${data.name} | ${data.currentRole}`);

    // Try to extract skills (we'll just grab the text from any visible 'Skills' section)
    const skillsText = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('span.visually-hidden'));
      return els.map(el => el.textContent?.trim() || "").filter(t => t.length > 0);
    }).catch(() => []);
    
    // Quick heuristic: Some of these hidden spans in LinkedIn DOM might be skills. We'll just grab a few random ones for now, or use a better selector if needed.
    // In a real robust scraper, we'd navigate to `/details/skills/`.
    // Let's do that actually!
    onLog("info", "Navigating to skills section...");
    await page.goto("https://www.linkedin.com/in/me/details/skills/", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    
    data.skills = await page.evaluate(() => {
      const skillNodes = document.querySelectorAll('span[aria-hidden="true"]');
      const uniqueSkills = new Set<string>();
      skillNodes.forEach(node => {
        const t = (node.textContent || "").trim();
        // filter out common noise
        if (t && t.length > 2 && t.length < 40 && !t.includes(":") && !t.includes("Show all")) {
          uniqueSkills.add(t);
        }
      });
      return Array.from(uniqueSkills).slice(0, 15); // Top 15 skills
    }).catch(() => []);

    // Get Recent Posts
    onLog("info", "Navigating to recent activity (posts)...");
    await page.goto("https://www.linkedin.com/in/me/recent-activity/all/", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    data.posts = await page.evaluate(() => {
      const postNodes = document.querySelectorAll('.update-components-text span[dir="ltr"]');
      const posts: string[] = [];
      postNodes.forEach(node => {
        const text = (node.textContent || "").trim();
        if (text && !posts.includes(text)) {
          posts.push(text);
        }
      });
      return posts.slice(0, 10); // get top 10 recent posts
    }).catch(() => []);

    onLog("info", `Extracted ${data.skills.length} skills and ${data.posts.length} posts.`);

  } catch (err: any) {
    onLog("error", `Profile extraction error: ${err.message}`);
  } finally {
    await ctx.close().catch(() => {});
  }

  return data;
}
