// artifacts/api-server/src/services/ai.service.ts
import { db } from "@workspace/db";
import { aiAnalysesTable } from "@workspace/db/schema/ai-analyses";
import { jobsTable } from "@workspace/db/schema/jobs";
import { logger } from "../lib/logger";

import { eq } from "drizzle-orm";
import { z } from "zod";

// Type definitions
interface AIBackend {
  name: string;
  model: string;
  url: string;
  apiKey?: string;
}

interface Job {
  id: number;
  title: string;
  company: string;
  description: string;
  requirements?: string[];
  location?: string;
  salary?: string;
}

interface Profile {
  name: string;
  currentRole: string;
  targetMarket: string;
  yearsOfExperience: string;
  skills: string[];
  cvText?: string;
}

interface ScoreResult {
  score: number;
  matchReason: string;
  confidence: number;
  jobRequirements: string[];
  profileMatch: string[];
}

// Schema validation
const scoreAnalysisResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  matchReason: z.string(),
  confidence: z.number().int().min(0).max(100),
  jobRequirements: z.array(z.string()),
  profileMatch: z.array(z.string()),
});

const roleExpansionSchema = z.object({
  primaryRole: z.string(),
  variations: z.array(z.string()),
  relatedKeywords: z.array(z.string()),
  exclusionKeywords: z.array(z.string()),
});

const fieldMappingResultSchema = z.array(z.tuple([z.string(), z.string(), z.string()]));

export class AIService {
  private backends: Record<string, AIBackend>;
  private defaultBackend: string;

  constructor() {
    // Default backends configuration
    this.backends = {
      "Claude": {
        name: "Claude",
        model: "claude-sonnet-4-20250514",
        url: "https://api.anthropic.com/v1",
      },
      "OpenAI": {
        name: "OpenAI",
        model: "gpt-4o",
        url: "https://api.openai.com/v1",
      },
      "Ollama": {
        name: "Ollama",
        model: "gpt-oss:120b-cloud",
        url: "http://localhost:11434",
      },
      "MCP": {
        name: "MCP",
        model: "custom",
        url: "",
      }
    };
    this.defaultBackend = "Ollama";
  }

  private async makeAIRequest(url: string, body: any, apiKey?: string) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["x-api-key"] = apiKey;
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });

      return await response.json();
    } catch (error) {
        logger.error({ url, err: error }, "AI request failed");
        throw new Error(`AI request failed: ${(error as Error).message}`);
    }
  }

  private getBackendConfig(backendName: string): { backend: AIBackend, apiKey: string | undefined } {
    const config = this.backends[backendName];
    if (!config) {
      throw new Error(`Backend ${backendName} not found`);
    }

    // In production, load API key from configuration
    const apiKey = process.env[`${backendName.toUpperCase()}_API_KEY`] || config.apiKey;
    return { backend: config, apiKey };
  }

  private getScoringPrompt(job: Omit<Job, "id">, profile: Profile): string {
    return `
Analyze how well this job matches this candidate's profile:

**Job Details:**
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Salary: ${job.salary || 'Not specified'}
Description: ${job.description}

    **Candidate Profile:**
    Name: ${profile.name || profile.Name || "User"}
    Current Role: ${profile.currentRole || profile["Current Role"] || "Software Engineer"}
    Target Market: ${profile.targetMarket || profile["Target Market"] || "Global"}
    Experience: ${profile.yearsOfExperience || profile["Years of Exp."] || "5"}
    Skills: ${Array.isArray(profile.skills) ? profile.skills.join(", ") : ""}
    CV Summary: ${(profile.cvText || "").substring(0, 500) || "Not provided"}

**Scoring Criteria:**
1. Skill match: How well do the candidate's skills match the job requirements?
2. Experience relevance: Is the candidate's experience appropriate for this role?
3. Role alignment: Does the role match the candidate's career trajectory?
4. Location suitability: Can the candidate work in the job location?
5. Compensation alignment: Is the salary range appropriate for the candidate's experience?

**Instructions:**
Provide a score from 0-100 representing the match quality, along with:
- A detailed match reason explaining the scoring
- Confidence score (0-100) in your assessment
- List of job requirements extracted from the description
- List of profile matches that align with the job

Respond ONLY with valid JSON following this schema:
{
  "score": number,
  "matchReason": string,
  "confidence": number,
  "jobRequirements": string[],
  "profileMatch": string[]
}`;
  }

  public async scoreJob(
    jobId: number,
    job: Omit<Job, "id">,
    profile: Profile,
    backendName: string = this.defaultBackend
  ): Promise<ScoreResult> {
    const startTime = Date.now();

    try {
      const { backend, apiKey } = this.getBackendConfig(backendName);

      // Create prompt
      const prompt = this.getScoringPrompt(job, profile);

      // Prepare request body based on backend
      let requestBody: any;

      switch (backend.name) {
        case "Claude":
          requestBody = {
            model: backend.model,
            messages: [
              { role: "user", content: prompt }
            ],
            max_tokens: 1024,
            temperature: 0.3,
          };
          break;

        case "OpenAI":
          requestBody = {
            model: backend.model,
            messages: [
              { role: "system", content: "You are an expert job matching assistant that responds ONLY with JSON." },
              { role: "user", content: prompt }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
          };
          break;

        case "Ollama":
          requestBody = {
            model: backend.model,
            prompt: prompt,
            format: "json",
            stream: false
          };
          break;

        case "MCP":
          throw new Error("MCP Server integration not implemented");

        default:
          throw new Error(`Backend ${backend.name} not supported for scoring`);
      }

      // Make AI request
      const endpoint = backend.name === "Ollama" 
        ? `${backend.url}/api/generate` 
        : backend.name === "OpenAI"
          ? `${backend.url}/chat/completions`
          : `${backend.url}/messages`;

      const response = await this.makeAIRequest(
        endpoint,
        requestBody,
        apiKey
      );

      // Parse and validate response
      let result: ScoreResult;

      try {
        // Handle different response formats
        let responseContent: string;

        if (backend.name === "Claude") {
          responseContent = response.content?.[0]?.text || JSON.stringify(response);
        } else if (backend.name === "OpenAI") {
          responseContent = response.choices?.[0]?.message?.content || JSON.stringify(response);
        } else if (backend.name === "Ollama") {
          if (response.error) throw new Error(`Ollama error: ${response.error}`);
          responseContent = response.response;
        } else {
          responseContent = JSON.stringify(response);
        }

        const parsed = this.parseAIResponse(responseContent);
        
        return {
          score: typeof parsed.score === "number" ? parsed.score : 70,
          matchReason: parsed.matchReason || "Match analyzed based on profile and job requirements.",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 80,
          jobRequirements: Array.isArray(parsed.jobRequirements) ? parsed.jobRequirements : [],
          profileMatch: Array.isArray(parsed.profileMatch) ? parsed.profileMatch : []
        };
      } catch (err: any) {
        logger.error({ response, err }, "Failed to parse AI response");
        throw new Error(`AI response error: ${err.message}`);
      }

      // Store analysis in database
      await db.insert(aiAnalysesTable).values({
        jobId: jobId,
        analysisType: "score",
        model: backend.model,
        backend: backend.name,
        result: result,
        confidence: result.confidence,
        inputContext: {
          job,
          profile,
          prompt
        },
        processingTimeMs: Date.now() - startTime
      });

      // Update job record with AI score
      await db.update(jobsTable)
        .set({
          aiScore: result.score,
          aiMatchReason: result.matchReason,
          aiProcessedAt: new Date().toISOString()
        })
        .where(eq(jobsTable.id, jobId));

      return result;

    } catch (error) {
      logger.error({ jobId, err: error }, "AI scoring failed");

      // Provide fallback scoring
      const fallbackResult = this.fallbackScoring(job);

      // Record fallback attempt
      await db.insert(aiAnalysesTable).values({
        jobId: jobId,
        analysisType: "score",
        model: "fallback",
        backend: "fallback",
        result: fallbackResult,
        confidence: 60, // Medium confidence for fallback
        inputContext: {
          job,
          error: (error as Error).message,
          fallbackUsed: true
        },
        processingTimeMs: Date.now() - startTime
      });

      return fallbackResult;
    }
  }

  private fallbackScoring(job: Omit<Job, "id">): ScoreResult {
    // Simple deterministic scoring based on job features
    let score = 70; // Base score

    // Adjust score based on job title keywords
    const title = job.title.toLowerCase();
    if (title.includes("senior")) score += 10;
    if (title.includes("lead") || title.includes("manager") || title.includes("architect")) score += 15;
    if (title.includes("junior") || title.includes("jr") || title.includes("assistant")) score -= 15;

    // Simulate some reasoning
    const matchReason = `Fallback scoring: Job title "${job.title}" indicates a ${
      title.includes("senior") ? "senior" : title.includes("junior") ? "junior" : "mid-level"
    } position. ` +
    `Without AI processing, assuming moderate match based on provided job details.`;

    // Simulate job requirements
    const jobRequirements = [];
    if (job.description) {
      const words = job.description.split(" ");
      const keywords = ["experience", "skills", "requirements", "qualifications"];
      const found = words.filter(word =>
        keywords.some(kw => word.toLowerCase().includes(kw))
      );

      if (found.length > 0 && jobRequirements.length === 0) {
        jobRequirements.push("Relevant experience", "Necessary skills", "Required qualifications");
      }
    }

    return {
      score: Math.min(100, Math.max(50, score)), // Clamp between 50-100
      matchReason: matchReason + (job.description ? " Job description suggests standard requirements." : ""),
      confidence: 60,
      jobRequirements: jobRequirements.length > 0 ? jobRequirements : ["Professional experience", "Technical skills"],
      profileMatch: []
    };
  }

  public async dedupeJobs(
    jobIds: number[],
    profile: Profile,
    backendName: string = this.defaultBackend
  ) {
    return [];
  }

  /**
   * Dynamically expand a job role into variations and related keywords using AI.
   */
  public async expandRole(
    role: string,
    backendName: string = this.defaultBackend
  ): Promise<z.infer<typeof roleExpansionSchema>> {
    try {
      const { backend, apiKey } = this.getBackendConfig(backendName);

      const prompt = `
Explain the job role "${role}" for a job search engine.
Provide:
1. The most common primary title for this role.
2. 5-8 variations of this job title (different seniority, synonyms).
3. 10-15 related technical keywords, tools, or skills associated with this role.
4. 5 exclusion keywords (roles that sound similar but are different).

Respond ONLY with valid JSON:
{
  "primaryRole": "string",
  "variations": ["string"],
  "relatedKeywords": ["string"],
  "exclusionKeywords": ["string"]
}`;

      let requestBody: any;
      if (backend.name === "Ollama") {
        requestBody = { model: backend.model, prompt, format: "json", stream: false };
      } else {
        requestBody = {
          model: backend.model,
          messages: [{ role: "system", content: "You are an expert recruitment researcher." }, { role: "user", content: prompt }],
          temperature: 0.3,
          response_format: { type: "json_object" }
        };
      }

      const endpoint = backend.name === "Ollama" 
        ? `${backend.url}/api/generate` 
        : backend.name === "OpenAI"
          ? `${backend.url}/chat/completions`
          : `${backend.url}/messages`;

      const response = await this.makeAIRequest(endpoint, requestBody, apiKey);
      
      let content: string;
      if (backend.name === "Claude") content = response.content?.[0]?.text;
      else if (backend.name === "OpenAI") content = response.choices?.[0]?.message?.content;
      else content = response.response;

      const parsed = this.parseAIResponse(content);
      return roleExpansionSchema.parse(parsed);

    } catch (error) {
      logger.error({ role, err: error }, "Role expansion failed, using fallback");
      // Manual intelligence fallback for common roles
      const roleLower = role.toLowerCase();
      let variations = [role];
      let keywords = role.split(/\s+/);

      if (roleLower.includes("ai") || roleLower.includes("machine learning")) {
        variations = [...variations, "Generative AI", "LLM Engineer", "Machine Learning Engineer", "AI Developer", "NLP Engineer"];
        keywords = [...keywords, "Python", "PyTorch", "TensorFlow", "Transformers", "OpenAI", "LangChain"];
      } else if (roleLower.includes("frontend") || roleLower.includes("react")) {
        variations = [...variations, "Frontend Developer", "React Developer", "UI Engineer", "Javascript Engineer"];
        keywords = [...keywords, "React", "Typescript", "Next.js", "Tailwind", "CSS"];
      } else if (roleLower.includes("backend") || roleLower.includes("node")) {
        variations = [...variations, "Backend Developer", "Node.js Developer", "Software Engineer", "Systems Engineer"];
        keywords = [...keywords, "Node.js", "PostgreSQL", "Redis", "Docker", "AWS"];
      }

      return {
        primaryRole: role,
        variations: [...new Set(variations)],
        relatedKeywords: [...new Set(keywords)],
        exclusionKeywords: []
      };
    }
  }

  public async mapFields(
    job: Job,
    profile: Profile,
    backendName: string = this.defaultBackend
  ): Promise<[string, string, string][]> {
    try {
      const { backend, apiKey } = this.getBackendConfig(backendName);

      const prompt = `
Map the candidate's profile information to the expected application form fields for this job.
For each common application field, provide:
1. Field Name
2. Best Value (from CV or inferred)
3. Match Status ("✓" for high confidence, "⚠ check" if unsure, "✗ manual" if missing)

    **Job:** ${job.title} at ${job.company}
    **Candidate:** ${profile.name || profile.Name || "User"} (${profile.currentRole || profile["Current Role"] || "Software Engineer"})
    **Skills:** ${Array.isArray(profile.skills) ? profile.skills.join(", ") : ""}
    **CV Text:** ${(profile.cvText || "").substring(0, 1000) || "Not provided"}

Respond ONLY with a JSON array of tuples: [["Field Name", "Value", "Status"], ...]`;

      let requestBody: any;
      if (backend.name === "Ollama") {
        requestBody = { model: backend.model, prompt, format: "json", stream: false };
      } else {
        requestBody = {
          model: backend.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        };
      }

      const endpoint = backend.name === "Ollama" 
        ? `${backend.url}/api/generate` 
        : backend.name === "OpenAI"
          ? `${backend.url}/chat/completions`
          : `${backend.url}/messages`;

      const response = await this.makeAIRequest(endpoint, requestBody, apiKey);

      let content: string;
      if (backend.name === "Claude") content = response.content?.[0]?.text;
      else if (backend.name === "OpenAI") content = response.choices?.[0]?.message?.content;
      else content = response.response;

      const parsed = this.parseAIResponse(content);
      return Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([k, v]) => [k, String(v), "✓"]);

    } catch (error) {
      logger.error({ err: error }, "Field mapping failed, using fallback");
      return [
        ["Full Name", profile.name, "✓"],
        ["Email", "Not provided", "✗ manual"],
        ["Current Position", profile.currentRole, "✓"],
        ["Experience", profile.yearsOfExperience, "✓"],
        ["Skills", profile.skills.slice(0, 3).join(", "), "⚠ check"],
        ["Location", profile.targetMarket, "⚠ check"]
      ];
    }
  }

  /**
   * Robust JSON parser that handles markdown blocks and LLM hallucinations (like word-numbers)
   */
  private parseAIResponse(content: string): any {
    if (!content) return {};
    
    // 1. Strip markdown code blocks if present
    let clean = content.replace(/```json/g, "").replace(/```/g, "").trim();
    
    // 2. Extract the JSON block if there is surrounding text
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    const arrayStart = clean.indexOf("[");
    const arrayEnd = clean.lastIndexOf("]");
    
    // Determine if we are looking for an object or an array
    if (start !== -1 && end !== -1 && (arrayStart === -1 || start < arrayStart)) {
       clean = clean.substring(start, end + 1);
    } else if (arrayStart !== -1 && arrayEnd !== -1) {
       clean = clean.substring(arrayStart, arrayEnd + 1);
    }

    // 3. Fix common non-JSON word-numbers hallucinations (e.g. "confidence": sixty)
    const wordMap: Record<string, string> = {
      "ten": "10", "twenty": "20", "thirty": "30", "forty": "40", "fifty": "50",
      "sixty": "60", "seventy": "70", "eighty": "80", "ninety": "90", "hundred": "100"
    };
    
    for (const [word, num] of Object.entries(wordMap)) {
      // Replace : word, :word, : "word"
      const regex = new RegExp(`:\\s*"?${word}"?\\b`, "gi");
      clean = clean.replace(regex, `: ${num}`);
    }

    try {
      return JSON.parse(clean);
    } catch (err) {
      // If still failing, try one last aggressive cleanup: remove trailing commas before closing braces
      clean = clean.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(clean);
    }
  }
}