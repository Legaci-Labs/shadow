import { convertRepoToMarkdown } from "@/lib/repomix";
import { analyzeRepo } from "@/lib/analyzer";

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

export async function POST(req: Request) {
  const { repoUrl } = await req.json();

  if (!repoUrl || !isValidGithubUrl(repoUrl)) {
    return new Response(
      JSON.stringify({ error: "Invalid GitHub URL. Use format: https://github.com/owner/repo" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = startHeartbeat(controller);
      try {
        // Step 1: Clone + Repomix
        sendEvent(controller, "status", { stage: "cloning", message: "Cloning repository..." });

        let repomixResult;
        try {
          repomixResult = await convertRepoToMarkdown(repoUrl);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          if (message.includes("private") || message.includes("404")) {
            sendEvent(controller, "error", { message: "This tool works with public repos only." });
          } else {
            sendEvent(controller, "error", { message: `Failed to process repository: ${message}` });
          }
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
        });

        // Step 2: Analyze with Claude
        sendEvent(controller, "status", { stage: "analyzing", message: "Analyzing repository..." });

        let analysis;
        try {
          analysis = await analyzeRepo(repomixResult.markdown);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          sendEvent(controller, "error", { message: `Analysis failed: ${message}` });
          controller.close();
          return;
        }

        // Send final result
        sendEvent(controller, "complete", {
          ...analysis,
          repoMarkdown: repomixResult.markdown,
          repomixMeta: {
            tokenCount: repomixResult.tokenCount,
            fileCount: repomixResult.fileCount,
            truncated: repomixResult.truncated,
          },
        });
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

export const maxDuration = 120;
