const fs = require('fs');
let code = fs.readFileSync('artifacts/jobpilot/src/lib/ai-utils.ts', 'utf8');

if (!code.includes('additionalSources?: {')) {
  code = code.replace(
    'scrapedAt?: string;',
    'scrapedAt?: string;\n  additionalSources?: {\n    source: string;\n    logo: string;\n    color: string;\n    url?: string;\n  }[];'
  );

  const fallbackOld = `    // Fallback implementation: Simple deduplication by title+company
    const seen = new Set();
    return jobs.filter(job => {
      const key = \`\${job.title.toLowerCase()}|\${job.company.toLowerCase()}\`;
      if (!seen.has(key)) {
        seen.add(key);
        return true;
      }
      return false;
    });`;

  const fallbackNew = `    // Fallback implementation: Grouping duplicates by title+company
    const grouped = new Map<string, Job>();
    for (const job of jobs) {
      // Create a fuzzy key by removing special chars and spaces
      const titleKey = job.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const compKey = job.company.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = \`\${titleKey}|\${compKey}\`;
      
      if (!grouped.has(key)) {
        grouped.set(key, { ...job, additionalSources: [] });
      } else {
        // It's a duplicate. Add its source to additionalSources of the primary job
        const primary = grouped.get(key)!;
        if (primary.source !== job.source) {
          // ensure we don't add duplicate sources
          const alreadyHas = primary.additionalSources?.some(s => s.source === job.source);
          if (!alreadyHas) {
            primary.additionalSources!.push({
              source: job.source,
              logo: job.logo,
              color: job.color,
              url: job.url
            });
          }
        }
      }
    }
    const result = Array.from(grouped.values());
    addLog("success", "RANK-AI", \`Deduplicated \${jobs.length} jobs into \${result.length} unique roles.\`);
    return result;`;

  code = code.replace(fallbackOld, fallbackNew);
  fs.writeFileSync('artifacts/jobpilot/src/lib/ai-utils.ts', code);
  console.log('Updated deduplication logic');
}
