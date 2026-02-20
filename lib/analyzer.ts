import { getGeminiClient, GEMINI_MODEL_ID } from "./vertex-client";
import { ANALYZER_SYSTEM_PROMPT } from "./prompts";

export interface RepoAnalysis {
  analysis: {
    summary: string;
    language: string;
    framework: string | null;
    projectType: string;
    apiSurface: Array<{
      name: string;
      type: string;
      description: string;
    }>;
    workflows: Array<{
      name: string;
      steps: string;
    }>;
    concepts: string[];
    integrations: string[];
    configPatterns: string[];
  };
  questions: Array<{
    id: string;
    question: string;
    options: string[] | null;
    multiSelect: boolean;
  }>;
  recommendedArchitecture: {
    type: string;
    files: Array<{
      name: string;
      purpose: string;
    }>;
  };
}

export async function analyzeRepo(
  repoMarkdown: string
): Promise<RepoAnalysis> {
  const gemini = await getGeminiClient();
  const model = gemini.getGenerativeModel({
    model: GEMINI_MODEL_ID,
    generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
    systemInstruction: { role: "system", parts: [{ text: ANALYZER_SYSTEM_PROMPT }] },
  });

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{ text: `Here is a GitHub repository converted to structured markdown by Repomix:\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nAnalyze this repository and generate clarifying questions for skill file generation.` }],
    }],
  });

  const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
    return JSON.parse(cleaned);
  }
}
