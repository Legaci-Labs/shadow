import { convertRepoToMarkdown } from "@/lib/repomix";
import { getVertexClient, getGeminiClient, MODEL_ID, FALLBACK_MODEL_ID, MODEL_TIMEOUT_MS, MODEL_DEADLINE_MS } from "@/lib/vertex-client";
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

/** Send SSE keepalive comments every 10s to prevent Vercel idle timeout */
function startHeartbeat(controller: ReadableStreamDefaultController): NodeJS.Timeout {
  const encoder = new TextEncoder();
  return setInterval(() => {
    try {
      controller.enqueue(encoder.encode(": keepalive\n\n"));
    } catch {
      // controller closed
    }
  }, 10_000);
}

async function streamGenerate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  model: string,
  system: string,
  userContent: string,
  controller: ReadableStreamDefaultController,
  timeoutMs?: number,
  deadlineMs?: number
): Promise<{ text: string; stopReason: string; timedOut: boolean }> {
  const messageStream = client.messages.stream({
    model,
    max_tokens: 64000,
    temperature: 0.2,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  // Start collecting text immediately so no chunks are missed
  let fullText = "";
  messageStream.on("text", (text: string) => {
    fullText += text;
    sendEvent(controller, "chunk", { text, fullLength: fullText.length });
  });

  // If timeout specified, race first text chunk against a timer
  if (timeoutMs) {
    const gotFirstChunk = new Promise<"chunk">((resolve) => {
      messageStream.once("text", () => resolve("chunk"));
    });
    const timeout = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), timeoutMs)
    );

    const race = await Promise.race([gotFirstChunk, timeout]);
    if (race === "timeout") {
      try { messageStream.abort(); } catch { /* best effort */ }
      return { text: "", stopReason: "", timedOut: true };
    }
  }

  // If deadline specified, race completion against a total time limit
  if (deadlineMs) {
    const done = messageStream.finalMessage();
    const deadline = new Promise<"deadline">((resolve) =>
      setTimeout(() => resolve("deadline"), deadlineMs)
    );

    const race = await Promise.race([done, deadline]);
    if (race === "deadline") {
      try { messageStream.abort(); } catch { /* best effort */ }
      return { text: fullText, stopReason: "", timedOut: true };
    }

    const finalMessage = race;
    return {
      text: fullText,
      stopReason: finalMessage.stop_reason ?? "end_turn",
      timedOut: false,
    };
  }

  const finalMessage = await messageStream.finalMessage();
  return {
    text: fullText,
    stopReason: finalMessage.stop_reason ?? "end_turn",
    timedOut: false,
  };
}

async function streamGenerateGemini(
  system: string,
  userContent: string,
  controller: ReadableStreamDefaultController
): Promise<{ text: string; stopReason: string; timedOut: boolean }> {
  const gemini = await getGeminiClient();
  const model = gemini.getGenerativeModel({
    model: FALLBACK_MODEL_ID,
    generationConfig: { maxOutputTokens: 65535, temperature: 0.2 },
    systemInstruction: { role: "system", parts: [{ text: system }] },
  });

  const result = await model.generateContentStream({
    contents: [{ role: "user", parts: [{ text: userContent }] }],
  });

  let fullText = "";
  for await (const chunk of result.stream) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (text) {
      fullText += text;
      sendEvent(controller, "chunk", { text, fullLength: fullText.length });
    }
  }

  return { text: fullText, stopReason: "end_turn", timedOut: false };
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
    metadata: { skillName, totalLines, fileCount: files.length, estimatedTriggerPhrases: [], relatedRepos: [] },
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
      const heartbeat = startHeartbeat(controller);
      try {
        // Step 1: Repomix
        sendEvent(controller, "status", { stage: "cloning", message: "Cloning repository..." });

        let repomixResult;
        try {
          repomixResult = await convertRepoToMarkdown(repoUrl);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
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
        const client = await getVertexClient();
        const userContent = `Here is a GitHub repository converted to structured markdown by Repomix:\n\n---BEGIN REPO MARKDOWN---\n${repomixResult.markdown}\n---END REPO MARKDOWN---\n\nAnalyze this repository and generate the complete skill architecture.`;

        sendEvent(controller, "status", {
          stage: "generating",
          message: "Zapping some code...",
        });

        let result = await streamGenerate(
          client,
          MODEL_ID,
          QUICK_GENERATE_SYSTEM_PROMPT,
          userContent,
          controller,
          MODEL_TIMEOUT_MS,
          MODEL_DEADLINE_MS
        );

        // Fallback to Gemini if primary timed out or hit deadline
        if (result.timedOut) {
          sendEvent(controller, "status", {
            stage: "generating",
            message: "Switching to faster model...",
          });

          result = await streamGenerateGemini(
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
      } finally {
        clearInterval(heartbeat);
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

export const maxDuration = 300;
