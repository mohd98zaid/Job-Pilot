// lib/db/src/schema/ai-analyses.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { jobsTable } from "./jobs";

// AI analysis tracking table
export const aiAnalysesTable = sqliteTable("ai_analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").references(() => jobsTable.id),
  analysisType: text("analysis_type").notNull().$type<
    "score" | "deduplication" | "field_mapping" | "match_analysis">(),
  model: text("model").notNull(),
  backend: text("backend").notNull(), // Backend name: "Claude", "OpenAI", etc.
  result: text("result", { mode: "json" }).notNull(), // Varies by analysis type
  confidence: integer("confidence"), // 0-100 confidence score
  inputContext: text("input_context", { mode: "json" }), // Input data for auditability
  processingTimeMs: integer("processing_time_ms"), // Performance tracking

  // Timestamps
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  processedAt: text("processed_at").default("CURRENT_TIMESTAMP"),
});

// Analysis-specific result schemas
export const scoreAnalysisResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  matchReason: z.string(),
  confidence: z.number().int().min(0).max(100),
  jobRequirements: z.array(z.string()),
  profileMatch: z.array(z.string()),
});

export const fieldMappingResultSchema = z.array(z.object({
  field: z.string(),
  value: z.string(),
  status: z.enum(["✓", "⚠ check", "✗ manual"]),
  confidence: z.number().int().min(0).max(100).optional(),
  reason: z.string().optional()
}));

export const dedupeAnalysisResultSchema = z.object({
  isDuplicate: z.boolean(),
  originalJobId: z.number().int().optional(),
  similarityScore: z.number().min(0).max(1)
});

// Zod schemas for validation
export const insertAIAnalysisSchema = z.object({
  jobId: z.number().int().optional().nullable(),
  model: z.string(),
  analysisType: z.string(),
  backend: z.string(),
  result: z.any(),
  confidence: z.number().int().optional().nullable(),
  inputContext: z.any().optional().nullable(),
  processingTimeMs: z.number().int().optional().nullable(),
  createdAt: z.date().optional(),
  processedAt: z.date().optional(),
});

export const updateAIAnalysisSchema = insertAIAnalysisSchema.partial();
export const selectAIAnalysisSchema = insertAIAnalysisSchema;

// TypeScript types
export type InsertAIAnalysis = z.infer<typeof insertAIAnalysisSchema>;
export type AIAnalysis = typeof aiAnalysesTable.$inferSelect;
export type ScoreAnalysisResult = z.infer<typeof scoreAnalysisResultSchema>;
export type FieldMappingResult = z.infer<typeof fieldMappingResultSchema>;
export type DedupeAnalysisResult = z.infer<typeof dedupeAnalysisResultSchema>;