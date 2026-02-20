import { getVertexClient, MODEL_ID } from "./vertex-client";
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

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("");
}

export async function analyzeRepo(
  repoMarkdown: string
): Promise<RepoAnalysis> {
  const client = getVertexClient();

  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 4096,
    temperature: 0.3,
    system: ANALYZER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is a GitHub repository converted to structured markdown by Repomix:\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nAnalyze this repository and generate clarifying questions for skill file generation.`,
      },
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = extractText(message.content as any);

  try {
    return JSON.parse(text);
  } catch {
    // Retry once with explicit JSON instruction
    const retry = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 4096,
      temperature: 0.1,
      system: ANALYZER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is a GitHub repository converted to structured markdown by Repomix:\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nAnalyze this repository and generate clarifying questions for skill file generation.`,
        },
        {
          role: "assistant",
          content: text,
        },
        {
          role: "user",
          content:
            "Your response was not valid JSON. Please respond ONLY with valid JSON, no markdown fences, no preamble.",
        },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retryText = extractText(retry.content as any);
    return JSON.parse(retryText);
  }
}
