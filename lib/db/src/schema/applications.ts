// lib/db/src/schema/applications.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { jobsTable } from "./jobs";

// Job applications tracking table
export const applicationsTable = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").references(() => jobsTable.id),
  userId: text("user_id").notNull(), // Will use profile name as identifier

  // Application lifecycle status
  status: text("status").default("draft").$type<
    "draft" | "in_progress" | "submitted" | "interview" | "offer" | "rejected">(),

  // Timestamps
  appliedAt: text("applied_at"),
  submittedAt: text("submitted_at"),

  // AI auto-fill data
  fieldMappings: text("field_mappings", { mode: "json" }).$type<Array<{
    field: string;
    value: string;
    status: "✓" | "⚠ check" | "✗ manual";
    confidence?: number;
  }>>(),
  aiConfidence: integer("ai_confidence"),

  // Source tracking
  source: text("source"), // Where application was submitted
  applicationUrl: text("application_url"),

  // Metadata storage
  metadata: text("metadata", { mode: "json" }),

  // Timestamps
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// Zod schemas for validation
export const insertApplicationSchema = z.object({
  jobId: z.number().int().optional().nullable(),
  userId: z.string(),
  status: z.string().optional().nullable(),
  appliedAt: z.date().optional().nullable(),
  submittedAt: z.date().optional().nullable(),
  fieldMappings: z.any().optional().nullable(),
  aiConfidence: z.number().int().optional().nullable(),
  source: z.string().optional().nullable(),
  applicationUrl: z.string().optional().nullable(),
  metadata: z.any().optional().nullable(),
  createdAt: z.date().optional().nullable(),
  updatedAt: z.date().optional().nullable(),
});

export const updateApplicationSchema = insertApplicationSchema.partial();
export const selectApplicationSchema = insertApplicationSchema;

// TypeScript types
export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;