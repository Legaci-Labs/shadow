import { NextResponse } from "next/server";
import { generateSkill } from "@/lib/generator";

export async function POST(req: Request) {
  try {
    const { analysis, answers, repoMarkdown } = await req.json();

    if (!analysis || !answers || !repoMarkdown) {
      return NextResponse.json(
        { error: "Missing required fields: analysis, answers, repoMarkdown" },
        { status: 400 }
      );
    }

    let result;
    try {
      result = await generateSkill(analysis, answers, repoMarkdown);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("auth") || message.includes("credentials")) {
        return NextResponse.json(
          { error: "GCP authentication failed. Check service account credentials." },
          { status: 500 }
        );
      }
      if (message.includes("rate") || message.includes("429")) {
        return NextResponse.json(
          { error: "High demand — queued. Please try again in a moment." },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `Generation failed: ${message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Unexpected error: ${message}` },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
