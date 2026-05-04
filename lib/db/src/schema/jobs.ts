// lib/db/src/schema/jobs.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Job listings table
export const jobsTable = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  salary: text("salary"),
  description: text("description"),
  source: text("source").notNull(),
  externalId: text("external_id").unique(), // Unique ID from job board
  url: text("url"),

  // Application status tracking
  status: text("status").default("discovered").$type<
    "discovered" | "saved" | "applied" | "interview" | "offer" | "rejected"
  >(),

  // AI evaluation fields
  aiScore: integer("ai_score"),
  aiMatchReason: text("ai_match_reason"),
  aiProcessedAt: text("ai_processed_at"), // ISO string

  // Metadata storage
  metadata: text("metadata", { mode: "json" }),

  // Timestamps
  postedAt: text("posted_at"), // ISO string
  scrapedAt: text("scraped_at").default("CURRENT_TIMESTAMP"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

// Zod schemas for validation
export const insertJobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional().nullable(),
  salary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  source: z.string(),
  externalId: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  aiScore: z.number().int().optional().nullable(),
  aiMatchReason: z.string().optional().nullable(),
  aiProcessedAt: z.date().optional().nullable(),
  metadata: z.any().optional().nullable(),
  postedAt: z.date().optional().nullable(),
  scrapedAt: z.date().optional().nullable(),
  createdAt: z.date().optional().nullable(),
  updatedAt: z.date().optional().nullable(),
});

export const updateJobSchema = insertJobSchema.partial();
export const selectJobSchema = insertJobSchema;

// TypeScript types
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;