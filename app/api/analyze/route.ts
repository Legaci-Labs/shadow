import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
  try {
    const { repoUrl } = await req.json();

    if (!repoUrl || !isValidGithubUrl(repoUrl)) {
      return NextResponse.json(
        { error: "Invalid GitHub URL. Use format: https://github.com/owner/repo" },
        { status: 400 }
      );
    }

    // Convert repo to markdown via Repomix
    let repomixResult;
    try {
      repomixResult = await convertRepoToMarkdown(repoUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("private") || message.includes("404")) {
        return NextResponse.json(
          { error: "This tool works with public repos only." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `Failed to process repository: ${message}` },
        { status: 500 }
      );
    }

    // Check for non-code repos
    if (repomixResult.tokenCount < 1000 && repomixResult.markdown.length < 4000) {
      return NextResponse.json(
        { error: "Not enough source code for a useful skill." },
        { status: 400 }
      );
    }

    // Analyze with Claude via Vertex AI
    let analysis;
    try {
      analysis = await analyzeRepo(repomixResult.markdown);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("auth") || message.includes("credentials")) {
        return NextResponse.json(
          { error: "GCP authentication failed. Check service account credentials." },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: `Analysis failed: ${message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...analysis,
      repoMarkdown: repomixResult.markdown,
      repomixMeta: {
        tokenCount: repomixResult.tokenCount,
        fileCount: repomixResult.fileCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
