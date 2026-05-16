// lib/db/src/schema/discovery-logs.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { z } from "zod";

// Discovery search logs for persistence and observability
export const discoveryLogsTable = sqliteTable("discovery_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(), // Links multiple events to one "Discover" click
  type: text("type").notNull().$type<"info" | "success" | "warning" | "error">(),
  source: text("source").notNull().$type<"system" | "scraper" | "ai" | "captcha">(),
  message: text("message").notNull(),
  metadata: text("metadata", { mode: "json" }), // Store query params, job counts, etc.
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
});

// Zod schemas for validation
export const insertDiscoveryLogSchema = z.object({
  sessionId: z.string(),
  type: z.enum(["info", "success", "warning", "error"]),
  source: z.enum(["system", "scraper", "ai", "captcha"]),
  message: z.string(),
  metadata: z.any().optional().nullable(),
});

export type DiscoveryLog = typeof discoveryLogsTable.$inferSelect;
export type InsertDiscoveryLog = z.infer<typeof insertDiscoveryLogSchema>;
