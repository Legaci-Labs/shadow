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

/**
 * Stream a message and collect the full text + stop reason.
 */
async function streamMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  params: {
    model: string;
    max_tokens: number;
    temperature: number;
    system: string;
    messages: Array<{ role: string; content: string }>;
  }
): Promise<{ text: string; stopReason: string }> {
  const stream = await client.messages.stream(params);
  const response = await stream.finalMessage();

  const text = response.content
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("");

  return { text, stopReason: response.stop_reason ?? "end_turn" };
}

/**
 * Attempt to repair truncated JSON from a max_tokens cutoff.
 */
function repairTruncatedJson(text: string): SkillResult | null {
  const filesMatch = text.match(/"files"\s*:\s*\[/);
  if (!filesMatch || filesMatch.index === undefined) return null;

  const filesStart = filesMatch.index + filesMatch[0].length;
  const files: SkillFile[] = [];
  const fileRegex =
    /\{\s*"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
  fileRegex.lastIndex = filesStart;

  let match;
  while ((match = fileRegex.exec(text)) !== null) {
    files.push({
      path: match[1],
      content: match[2]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\"),
    });
  }

  if (files.length === 0) return null;

  const nameMatch = text.match(/"skillName"\s*:\s*"([^"]+)"/);
  const skillName = nameMatch?.[1] ?? "skill";
  const totalLines = files.reduce(
    (sum, f) => sum + f.content.split("\n").length,
    0
  );

  return {
    files,
    metadata: {
      skillName,
      totalLines,
      fileCount: files.length,
      estimatedTriggerPhrases: [],
    },
  };
}

export async function generateSkill(
  analysis: RepoAnalysis,
  answers: Record<string, string>,
  repoMarkdown: string
): Promise<SkillResult> {
  const client = await getVertexClient();

  const userContent = `## Repository Analysis\n${JSON.stringify(analysis)}\n\n## User Preferences\n${JSON.stringify(answers)}\n\n## Full Repository Source (Repomix compressed markdown)\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nGenerate the complete skill architecture.`;

  const { text, stopReason } = await streamMessage(client, {
    model: MODEL_ID,
    max_tokens: 64000,
    temperature: 0.2,
    system: GENERATOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  // Try normal parse first
  try {
    return JSON.parse(text);
  } catch {
    // If truncated, try to repair
    if (stopReason === "max_tokens") {
      const repaired = repairTruncatedJson(text);
      if (repaired && repaired.files.length > 0) {
        return repaired;
      }
    }

    // Retry with streaming, ask to complete or compress
    const { text: retryText } = await streamMessage(client, {
      model: MODEL_ID,
      max_tokens: 64000,
      temperature: 0.1,
      system: GENERATOR_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userContent },
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            "Your JSON response was truncated. Please respond with the COMPLETE valid JSON. If the skill content is too long, reduce the detail level to fit within the response limit.",
        },
      ],
    });

    try {
      return JSON.parse(retryText);
    } catch {
      const repaired = repairTruncatedJson(retryText);
      if (repaired && repaired.files.length > 0) {
        return repaired;
      }
      throw new Error(
        "Failed to generate valid skill files. Try a smaller or more focused repository."
      );
    }
  }
}
