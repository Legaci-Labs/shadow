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

/**
 * Extract just the directory tree + key config/manifest files from the full
 * repomix markdown. This is ~5-10% of the full size — enough for analysis,
 * way faster for the LLM.
 */
const KEY_FILE_PATTERNS = [
  /readme/i,
  /package\.json$/,
  /cargo\.toml$/,
  /pyproject\.toml$/,
  /go\.mod$/,
  /requirements\.txt$/,
  /setup\.py$/,
  /setup\.cfg$/,
  /gemfile$/i,
  /\.csproj$/,
  /pom\.xml$/,
  /build\.gradle/,
  /makefile$/i,
  /dockerfile$/i,
  /docker-compose/i,
  /\.env\.example$/,
  /tsconfig\.json$/,
  /next\.config/,
  /vite\.config/,
  /webpack\.config/,
];

function extractAnalysisContext(repoMarkdown: string): string {
  const parts: string[] = [];

  // 1. Extract directory tree (between "Directory Structure" and "File Contents")
  const treeMatch = repoMarkdown.match(
    /(?:## (?:Directory Structure|Repository Structure|File Summary)[\s\S]*?)(?=## File Contents|$)/i
  );
  if (treeMatch) {
    parts.push(treeMatch[0].slice(0, 10_000)); // cap tree at 10K chars
  }

  // 2. Extract key config/manifest files
  // Repomix format: "## File: path/to/file" followed by content until next "## File:"
  const fileBlocks = repoMarkdown.split(/(?=^## File: )/m);
  for (const block of fileBlocks) {
    const pathMatch = block.match(/^## File: (.+)/);
    if (!pathMatch) continue;
    const filePath = pathMatch[1].trim();
    if (KEY_FILE_PATTERNS.some((p) => p.test(filePath))) {
      parts.push(block.slice(0, 5_000)); // cap each key file at 5K
    }
  }

  // 3. Also try alternative repomix format: "File: path/to/file" with backtick blocks
  if (parts.length <= 1) {
    const altBlocks = repoMarkdown.split(/(?=^File: )/m);
    for (const block of altBlocks) {
      const pathMatch = block.match(/^File: (.+)/);
      if (!pathMatch) continue;
      const filePath = pathMatch[1].trim();
      if (KEY_FILE_PATTERNS.some((p) => p.test(filePath))) {
        parts.push(block.slice(0, 5_000));
      }
    }
  }

  // If we couldn't parse the structure, fall back to first 20K chars
  if (parts.length === 0) {
    return repoMarkdown.slice(0, 20_000);
  }

  return parts.join("\n\n");
}

export async function analyzeRepo(
  repoMarkdown: string
): Promise<RepoAnalysis> {
  const context = extractAnalysisContext(repoMarkdown);

  const gemini = await getGeminiClient();
  const model = gemini.getGenerativeModel({
    model: GEMINI_MODEL_ID,
    generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
    systemInstruction: { role: "system", parts: [{ text: ANALYZER_SYSTEM_PROMPT }] },
  });

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{ text: `Here is a GitHub repository structure and key configuration files:\n\n---BEGIN REPO CONTEXT---\n${context}\n---END REPO CONTEXT---\n\nAnalyze this repository and generate clarifying questions for skill file generation.` }],
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
