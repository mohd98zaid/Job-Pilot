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

  // 0. Location check (if targetRegion provided)
  if (targetRegion) {
    const regionLower = targetRegion.toLowerCase();
    const rawLocation = (tags.find(t => t.startsWith("loc:")) || "").replace("loc:", "").toLowerCase().trim();

    // No location → trust the search URL / caller's filtering (pass through)
    if (rawLocation && rawLocation !== "not listed" && rawLocation !== "remote") {
      // Build expanded region terms for alias matching
      const regionTerms = buildLocationTerms(regionLower);
      const isRemote = rawLocation.includes("remote") || rawLocation.includes("anywhere") || text.includes("remote");

      // Match if the location contains any of our region terms
      const isMatch = isRemote || regionTerms.some((term) =>
        rawLocation.includes(term) || term.includes(rawLocation.split(",")[0].trim())
      );

      if (!isMatch) {
        // Hard-reject only if location explicitly names a DIFFERENT major region.
        // This list covers all countries/cities that are NOT part of the UAE/Gulf cluster.
        const OTHER_REGIONS = [
          // South Asia
          "india", "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "pune",
          "chennai", "kolkata", "noida", "gurgaon", "pakistan", "karachi", "lahore",
          "islamabad", "bangladesh", "dhaka", "sri lanka", "colombo", "nepal", "kathmandu",
          // Southeast Asia
          "singapore", "malaysia", "kuala lumpur", "indonesia", "jakarta",
          "philippines", "manila", "vietnam", "hanoi", "thailand", "bangkok",
          // East Asia
          "china", "beijing", "shanghai", "hong kong", "japan", "tokyo", "south korea", "seoul",
          // Europe
          "london", "united kingdom", "uk", "germany", "berlin", "france", "paris",
          "netherlands", "amsterdam", "spain", "madrid", "italy", "rome", "sweden", "stockholm",
          "norway", "oslo", "denmark", "copenhagen", "poland", "warsaw",
          // Americas
          "new york", "san francisco", "los angeles", "chicago", "toronto", "canada",
          "brazil", "são paulo", "mexico", "mexico city",
          // Oceania
          "sydney", "melbourne", "australia", "new zealand", "auckland",
          // Africa (non-Gulf MENA)
          "egypt", "cairo", "south africa", "johannesburg", "nigeria", "lagos",
        ];
        const isDifferentRegion = OTHER_REGIONS.some((r) =>
          rawLocation.includes(r) && !regionTerms.includes(r)
        );
        if (isDifferentRegion) return false;
        // Otherwise: uncertain location → allow (don't reject on ambiguity)
      }
    }
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

  if (r.includes("dubai") || r.includes("uae") || r.includes("abu dhabi") || r.includes("sharjah")) {
    terms.push("dubai", "uae", "united arab emirates", "gulf", "ae");
  } else if (r.includes("bangalore") || r.includes("bengaluru")) {
    terms.push("bangalore", "bengaluru", "karnataka", "india");
  } else if (r.includes("mumbai") || r.includes("bombay")) {
    terms.push("mumbai", "bombay", "maharashtra", "india");
  } else if (r.includes("singapore")) {
    terms.push("singapore", "sg");
  } else if (r.includes("london")) {
    terms.push("london", "uk", "united kingdom", "england", "britain");
  } else if (r.includes("new york") || r.includes("nyc")) {
    terms.push("new york", "nyc", "ny", "usa", "united states");
  } else if (r.includes("india")) {
    terms.push("india", "in", "bharat");
  }

  return [...new Set(terms)];
}
