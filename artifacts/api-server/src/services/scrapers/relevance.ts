// artifacts/api-server/src/services/scrapers/relevance.ts
// Shared utility for cross-scraper relevance filtering.

/**
 * Checks if a job is relevant to the search query using weighted keyword matching.
 * Handles phrases, aliases, and word boundaries.
 */
export function isJobRelevant(
  title: string,
  description: string,
  tags: string[],
  roleQuery: string,
  aliases: string[] = [],
  exclusions: string[] = [],
  targetRegion: string = ""
): boolean {
  const titleLower = title.toLowerCase();
  const text = `${title} ${tags.join(" ")} ${description.substring(0, 500)}`.toLowerCase();
  const query = roleQuery.toLowerCase();

  // 0. Location check (if targetRegion provided) — STRICT enforcement
  if (targetRegion) {
    const regionLower = targetRegion.toLowerCase();
    const rawLocation = (tags.find(t => t.startsWith("loc:")) || "").replace("loc:", "").toLowerCase().trim();

    if (rawLocation && rawLocation !== "not listed" && rawLocation !== "not specified") {
      // Build expanded region terms for alias matching
      const regionTerms = buildLocationTerms(regionLower);
      const isRemote = rawLocation.includes("remote") || rawLocation.includes("anywhere") || rawLocation.includes("worldwide");

      // Match if the location contains any of our region terms
      const isMatch = isRemote || regionTerms.some((term) =>
        rawLocation.includes(term) || term.includes(rawLocation.split(",")[0].trim())
      );

      if (!isMatch) {
        // STRICT: reject if location doesn't match the target region.
        // Only exception: if the location is very generic (e.g., "Middle East", "GCC", "MENA")
        // and the target is a Gulf country, allow it.
        const genericGulfTerms = ["middle east", "gcc", "mena", "gulf"];
        const isGenericGulf = genericGulfTerms.some(g => rawLocation.includes(g));
        const targetIsGulf = ["dubai", "uae", "abu dhabi", "sharjah", "qatar", "saudi", "bahrain", "kuwait", "oman"]
          .some(g => regionLower.includes(g));
        
        if (isGenericGulf && targetIsGulf) {
          // Allow — "Middle East" is acceptable for Gulf searches
        } else {
          return false; // Location doesn't match — reject
        }
      }
    }
    // If no location data → pass through (trust the search URL filtering)
  }

  // 0. Exclusions check (highest priority)
  if (exclusions.length > 0) {
    // If any exclusion is found in the title, reject immediately
    if (exclusions.some(exc => titleLower.includes(exc.toLowerCase()))) {
      return false;
    }
  }

  // 1. Direct phrase match
  if (text.includes(query)) return true;

  // 2. Handle aliases (user-provided or AI-expanded)
  if (aliases.length > 0) {
    if (aliases.some(alias => text.includes(alias.toLowerCase()))) return true;
  }

  // 3. Keyword-based matching with word boundaries
  const keywords = query.split(/\s+/).filter(k => k.length > 1);
  if (keywords.length === 0) return true;

  // Use every() for strictness, but allow partial matches if they are whole words
  const isMatch = keywords.every(kw => {
    // Escape for regex
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match as whole word
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(text);
  });

  return isMatch;
}

/**
 * Expand a region string into all its known aliases for robust location matching.
 * e.g. "dubai" → ["dubai", "uae", "united arab emirates", "gulf"]
 */
export function buildLocationTerms(region: string): string[] {
  const r = region.toLowerCase();
  const terms: string[] = [r];

  // Gulf / UAE
  if (r.includes("dubai") || r.includes("uae") || r.includes("abu dhabi") || r.includes("sharjah") || r.includes("ajman")) {
    terms.push("dubai", "uae", "united arab emirates", "abu dhabi", "sharjah", "ajman", "ras al", "fujairah", "gulf", "ae");
  }
  // Saudi Arabia
  else if (r.includes("saudi") || r.includes("riyadh") || r.includes("jeddah") || r.includes("ksa")) {
    terms.push("saudi", "saudi arabia", "riyadh", "jeddah", "dammam", "ksa", "khobar");
  }
  // Qatar
  else if (r.includes("qatar") || r.includes("doha")) {
    terms.push("qatar", "doha");
  }
  // Bahrain
  else if (r.includes("bahrain") || r.includes("manama")) {
    terms.push("bahrain", "manama");
  }
  // Kuwait
  else if (r.includes("kuwait")) {
    terms.push("kuwait", "kuwait city");
  }
  // Oman
  else if (r.includes("oman") || r.includes("muscat")) {
    terms.push("oman", "muscat");
  }
  // India (general)
  else if (r === "india" || r === "in") {
    terms.push("india", "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "pune",
      "chennai", "kolkata", "noida", "gurgaon", "gurugram", "ncr", "in");
  }
  // Indian cities
  else if (r.includes("bangalore") || r.includes("bengaluru")) {
    terms.push("bangalore", "bengaluru", "karnataka", "india");
  } else if (r.includes("mumbai") || r.includes("bombay")) {
    terms.push("mumbai", "bombay", "maharashtra", "india");
  } else if (r.includes("delhi") || r.includes("ncr") || r.includes("noida") || r.includes("gurgaon") || r.includes("gurugram")) {
    terms.push("delhi", "new delhi", "ncr", "noida", "gurgaon", "gurugram", "india");
  } else if (r.includes("hyderabad")) {
    terms.push("hyderabad", "telangana", "india");
  } else if (r.includes("pune")) {
    terms.push("pune", "maharashtra", "india");
  } else if (r.includes("chennai")) {
    terms.push("chennai", "tamil nadu", "india");
  }
  // Singapore
  else if (r.includes("singapore")) {
    terms.push("singapore", "sg");
  }
  // UK
  else if (r.includes("london") || r.includes("uk") || r.includes("united kingdom")) {
    terms.push("london", "uk", "united kingdom", "england", "britain");
  }
  // USA
  else if (r.includes("new york") || r.includes("nyc")) {
    terms.push("new york", "nyc", "ny", "usa", "united states");
  } else if (r.includes("san francisco") || r.includes("sf") || r.includes("bay area")) {
    terms.push("san francisco", "sf", "bay area", "california", "usa", "united states");
  } else if (r.includes("usa") || r.includes("united states")) {
    terms.push("usa", "united states", "us");
  }
  // Canada
  else if (r.includes("canada") || r.includes("toronto")) {
    terms.push("canada", "toronto", "vancouver", "montreal", "ca");
  }
  // Australia
  else if (r.includes("australia") || r.includes("sydney") || r.includes("melbourne")) {
    terms.push("australia", "sydney", "melbourne", "au");
  }
  // Germany
  else if (r.includes("germany") || r.includes("berlin") || r.includes("munich")) {
    terms.push("germany", "berlin", "munich", "frankfurt", "de", "deutschland");
  }

  return [...new Set(terms)];
}
