import { getVertexClient, MODEL_ID } from "./vertex-client";
import { GENERATOR_SYSTEM_PROMPT } from "./prompts";
import type { RepoAnalysis } from "./analyzer";

export interface SkillFile {
  path: string;
  content: string;
}

export interface SkillResult {
  files: SkillFile[];
  metadata: {
    skillName: string;
    totalLines: number;
    fileCount: number;
    estimatedTriggerPhrases: string[];
  };
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("");
}

export async function generateSkill(
  analysis: RepoAnalysis,
  answers: Record<string, string>,
  repoMarkdown: string
): Promise<SkillResult> {
  const client = getVertexClient();

  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 16000,
    temperature: 0.2,
    system: GENERATOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Repository Analysis\n${JSON.stringify(analysis)}\n\n## User Preferences\n${JSON.stringify(answers)}\n\n## Full Repository Source (Repomix compressed markdown)\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nGenerate the complete skill architecture.`,
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
      max_tokens: 16000,
      temperature: 0.1,
      system: GENERATOR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `## Repository Analysis\n${JSON.stringify(analysis)}\n\n## User Preferences\n${JSON.stringify(answers)}\n\n## Full Repository Source (Repomix compressed markdown)\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nGenerate the complete skill architecture.`,
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
