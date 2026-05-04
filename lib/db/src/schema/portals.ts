// lib/db/src/schema/portals.ts
import { text, integer } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";

// Custom / company career portals saved by the user
export const portalsTable = sqliteTable("portals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),          // e.g. "Google Careers"
  url: text("url").notNull(),            // e.g. "https://careers.google.com"
  type: text("type").default("company"), // "company" | "custom"
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default(new Date().toISOString()),
});

// Zod schemas
export const insertPortalSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.enum(["company", "custom"]).default("company"),
  isActive: z.boolean().default(true),
});

export const updatePortalSchema = insertPortalSchema.partial();

export type InsertPortal = z.infer<typeof insertPortalSchema>;
export type Portal = typeof portalsTable.$inferSelect;
