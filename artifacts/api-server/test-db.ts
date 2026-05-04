// Test if the application can access the database
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { profilesTable } from "@workspace/db/schema/profiles";

async function testDatabase() {
  try {
    // Try to query the profiles table
    const profiles = await db.query.profilesTable.findFirst();
    console.log("Profiles table query successful:", profiles);
  } catch (error) {
    console.log("Database query failed:", error.message);
  }
}

testDatabase();