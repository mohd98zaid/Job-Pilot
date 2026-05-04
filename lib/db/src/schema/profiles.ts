// lib/db/src/schema/profiles.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User profiles table
export const profilesTable = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").unique().notNull(),
  name: text("name").notNull(),
  currentRole: text("current_role").notNull(),
  targetMarket: text("target_market"),
  yearsOfExperience: text("years_of_experience"),
  skills: text("skills", { mode: "json" }), // Array of skills

  // CV/Resume data
  cvText: text("cv_text"), // Extracted text for AI analysis
  cvMetadata: text("cv_metadata", { mode: "json" }), // e.g., file type, page count

  // AI Backends configuration
  aiBackends: text("ai_backends", { mode: "json" }).$type<Array<{
    name: string;
    model: string;
    url: string;
    apiKey?: string;
    default?: boolean;
  }>>().default([]),

  // Automation preferences
  automationSettings: text("automation_settings", { mode: "json" }).$type<{
    reviewBeforeSubmit: boolean;
    fullAuto: boolean;
    stealthMode: boolean;
    playwrightHeadless: boolean;
    humanLikeDelays: boolean;
  }>().default({
    reviewBeforeSubmit: true,
    fullAuto: false,
    stealthMode: true,
    playwrightHeadless: true,
    humanLikeDelays: true
  }),

  // Job discovery preferences
  searchPreferences: text("search_preferences", { mode: "json" }).$type<{
    defaultBoards: string[];
    defaultRole: string;
    defaultRegion: string;
    jobBoards: {
      [key: string]: {
        enabled: boolean;
        settings?: any;
      };
    };
  }>().default({
    defaultBoards: ["LinkedIn", "Wellfound", "Indeed"],
    defaultRole: "",
    defaultRegion: "",
    jobBoards: {}
  }),

  // Metadata
  metadata: text("metadata", { mode: "json" }),

  // Timestamps
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP"),
});

export const profileSchema = z.object({
  name: z.string().min(1),
  currentRole: z.string().min(1),
  targetMarket: z.string().optional(),
  yearsOfExperience: z.string().optional(),
  skills: z.array(z.string()).optional(),
  aiBackends: z.array(z.object({
    name: z.string(),
    model: z.string(),
    url: z.string().url(),
    apiKey: z.string().optional(),
    default: z.boolean().optional()
  })).optional()
});

export const insertProfileSchema = z.object({
  userId: z.string().optional(),
  name: z.string().min(1),
  currentRole: z.string().min(1),
  targetMarket: z.string().optional(),
  yearsOfExperience: z.string().optional(),
  skills: z.array(z.string()).optional(),
  cvText: z.string().optional(),
  cvMetadata: z.any().optional(),
  aiBackends: z.any().optional(),
  automationSettings: z.any().optional(),
  searchPreferences: z.any().optional(),
  metadata: z.any().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const updateProfileSchema = insertProfileSchema.partial();
export const selectProfileSchema = insertProfileSchema;

// TypeScript types
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
export type AIBackendConfig = NonNullable<Profile['aiBackends']>[number];