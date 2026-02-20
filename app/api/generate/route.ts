import { getVertexClient, getGeminiClient, MODEL_ID, FALLBACK_MODEL_ID, MODEL_TIMEOUT_MS } from "@/lib/vertex-client";
import { GENERATOR_SYSTEM_PROMPT } from "@/lib/prompts";

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

  // If timeout specified, race the stream start against a timer
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
  let firstChunkReceived = false;

  messageStream.on("text", (text: string) => {
    if (!firstChunkReceived) {
      firstChunkReceived = true;
    }
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

async function streamGenerateGemini(
  system: string,
  userContent: string,
  controller: ReadableStreamDefaultController
): Promise<{ text: string; stopReason: string; timedOut: boolean }> {
  const gemini = getGeminiClient();
  const model = gemini.getGenerativeModel({
    model: FALLBACK_MODEL_ID,
    generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
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
    metadata: { skillName, totalLines, fileCount: files.length, estimatedTriggerPhrases: [] },
  };
}

export async function POST(req: Request) {
  const { analysis, answers, repoMarkdown } = await req.json();

  if (!analysis || !answers || !repoMarkdown) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = getVertexClient();
        const userContent = `## Repository Analysis\n${JSON.stringify(analysis)}\n\n## User Preferences\n${JSON.stringify(answers)}\n\n## Full Repository Source (Repomix compressed markdown)\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nGenerate the complete skill architecture.`;

        sendEvent(controller, "status", {
          stage: "generating",
          message: `Generating with ${MODEL_ID}...`,
        });

        // Try primary model with timeout
        let result = await streamGenerate(
          client,
          MODEL_ID,
          GENERATOR_SYSTEM_PROMPT,
          userContent,
          controller,
          MODEL_TIMEOUT_MS
        );

        // Fallback to Gemini if timed out
        if (result.timedOut) {
          sendEvent(controller, "status", {
            stage: "generating",
            message: `Primary model slow, switching to ${FALLBACK_MODEL_ID}...`,
          });

          result = await streamGenerateGemini(
            GENERATOR_SYSTEM_PROMPT,
            userContent,
            controller
          );
        }

        // Parse result
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
          sendEvent(controller, "error", {
            message: "Failed to parse skill output. Try a smaller repository.",
          });
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
