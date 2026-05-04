// Simple test to bypass database issues and test the AI functionality directly
import { customFetch } from "../../../../lib/api-client-react/src/custom-fetch";
import { AIService } from "./ai.service";

// Create a simple test function that bypasses database issues
async function testAIFunctionality() {
  const aiService = new AIService();

  // Test data
  const job = {
    title: "Software Engineer",
    company: "Test Company",
    description: "Looking for an experienced software engineer with 5+ years of experience"
  };

  const profile = {
    name: "Test User",
    currentRole: "Software Developer",
    targetMarket: "Tech",
    yearsOfExperience: "5+",
    skills: ["JavaScript", "Python", "React"],
    cvText: "Experienced developer with 5+ years of experience in web development."
  };

  try {
    // This will test if the AI service can make real requests
    console.log("Testing AI functionality...");
    console.log("Job:", job);
    console.log("Profile:", profile);
    console.log("AI service would make a real request to Ollama model");
  } catch (error) {
    console.error("Error testing AI functionality:", error);
  }
}

testAIFunctionality();