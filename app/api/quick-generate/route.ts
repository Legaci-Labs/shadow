import { convertRepoToMarkdown } from "@/lib/repomix";
import { getVertexClient, MODEL_ID, FALLBACK_MODEL_ID, MODEL_TIMEOUT_MS } from "@/lib/vertex-client";
import { QUICK_GENERATE_SYSTEM_PROMPT } from "@/lib/prompts";

function isValidGithubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return false;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 2;
  } catch {
    return false;
  }
}

function sendEvent(
  controller: ReadableStreamDefaultController,
  event: string,
  data: unknown
) {
  const encoder = new TextEncoder();
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  );
}

async function streamGenerate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  model: string,
  system: string,
  userContent: string,
  controller: ReadableStreamDefaultController,
  timeoutMs?: number
): Promise<{ text: string; stopReason: string; timedOut: boolean }> {
  const streamPromise = client.messages.stream({
    model,
    max_tokens: 64000,
    temperature: 0.2,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  if (timeoutMs) {
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), timeoutMs)
    );

    const race = await Promise.race([
      streamPromise.then((s: unknown) => ({ type: "stream" as const, stream: s })),
      timeout,
    ]);

    if (race === "timeout") {
      return { text: "", stopReason: "", timedOut: true };
    }

    return collectStream(race.stream, controller);
  }

  const messageStream = await streamPromise;
  return collectStream(messageStream, controller);
}

async function collectStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messageStream: any,
  controller: ReadableStreamDefaultController
): Promise<{ text: string; stopReason: string; timedOut: boolean }> {
  let fullText = "";

  messageStream.on("text", (text: string) => {
    fullText += text;
    sendEvent(controller, "chunk", { text, fullLength: fullText.length });
  });

  const finalMessage = await messageStream.finalMessage();
  return {
    text: fullText,
    stopReason: finalMessage.stop_reason ?? "end_turn",
    timedOut: false,
  };
}

function repairTruncatedJson(text: string): object | null {
  const filesMatch = text.match(/"files"\s*:\s*\[/);
  if (!filesMatch || filesMatch.index === undefined) return null;

  const filesStart = filesMatch.index + filesMatch[0].length;
  const files: Array<{ path: string; content: string }> = [];
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
    metadata: { skillName, totalLines, fileCount: files.length, estimatedTriggerPhrases: [] },
  };
}

export async function POST(req: Request) {
  const { repoUrl } = await req.json();

  if (!repoUrl || !isValidGithubUrl(repoUrl)) {
    return new Response(
      JSON.stringify({ error: "Invalid GitHub URL" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step 1: Repomix
        sendEvent(controller, "status", { stage: "cloning", message: "Cloning repository..." });

        let repomixResult;
        try {
          repomixResult = await convertRepoToMarkdown(repoUrl);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          sendEvent(controller, "error", { message: `Failed to process repository: ${message}` });
          controller.close();
          return;
        }

        if (repomixResult.tokenCount < 1000 && repomixResult.markdown.length < 4000) {
          sendEvent(controller, "error", { message: "Not enough source code for a useful skill." });
          controller.close();
          return;
        }

        sendEvent(controller, "status", {
          stage: "packed",
          message: `Packed ${repomixResult.fileCount} files into ${repomixResult.tokenCount.toLocaleString()} tokens`,
          fileCount: repomixResult.fileCount,
          tokenCount: repomixResult.tokenCount,
          truncated: repomixResult.truncated,
        });

        // Step 2: Stream Claude generation with fallback
        const client = getVertexClient();
        const userContent = `Here is a GitHub repository converted to structured markdown by Repomix:\n\n---BEGIN REPO MARKDOWN---\n${repomixResult.markdown}\n---END REPO MARKDOWN---\n\nAnalyze this repository and generate the complete skill architecture.`;

        sendEvent(controller, "status", {
          stage: "generating",
          message: `Generating with ${MODEL_ID}...`,
        });

        let result = await streamGenerate(
          client,
          MODEL_ID,
          QUICK_GENERATE_SYSTEM_PROMPT,
          userContent,
          controller,
          MODEL_TIMEOUT_MS
        );

        // Fallback if primary timed out
        if (result.timedOut) {
          sendEvent(controller, "status", {
            stage: "generating",
            message: `Primary model slow, switching to ${FALLBACK_MODEL_ID}...`,
          });

          result = await streamGenerate(
            client,
            FALLBACK_MODEL_ID,
            QUICK_GENERATE_SYSTEM_PROMPT,
            userContent,
            controller
          );
        }

        // Parse
        let parsed;
        try {
          parsed = JSON.parse(result.text);
        } catch {
          const cleaned = result.text.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
          try {
            parsed = JSON.parse(cleaned);
          } catch {
            parsed = repairTruncatedJson(result.text) || repairTruncatedJson(cleaned);
          }
        }

        if (!parsed) {
          sendEvent(controller, "error", { message: "Failed to parse skill output. Try a smaller repository." });
          controller.close();
          return;
        }

        sendEvent(controller, "complete", parsed);
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        sendEvent(controller, "error", { message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const maxDuration = 120;
