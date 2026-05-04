// Test script to check database connection
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { profilesTable } from "@workspace/db/schema/profiles";

async function testDatabaseConnection() {
  try {
    console.log("Testing database connection...");

    // Try to query the profiles table
    const profile = await db.query.profilesTable.findFirst();
    console.log("First profile found:", profile);

    if (profile) {
      console.log("Database connection successful!");
      console.log("Profile data:", profile);
    } else {
      console.log("Database connection successful, but no profiles found");
    }
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
}

testDatabaseConnection();