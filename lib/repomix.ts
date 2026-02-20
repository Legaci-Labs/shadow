import { readFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export interface RepomixResult {
  markdown: string;
  tokenCount: number;
  fileCount: number;
  repoUrl: string;
}

export async function convertRepoToMarkdown(
  repoUrl: string
): Promise<RepomixResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "shadowoss-"));
  const outputPath = join(tempDir, "repo.md");

  try {
    // Dynamic import repomix to avoid bundling issues
    const { runCli } = await import("repomix");

    const result = await runCli(
      ["."],
      process.cwd(),
      {
        remote: repoUrl,
        output: outputPath,
        style: "markdown",
        compress: true,
        removeComments: false,
        removeEmptyLines: true,
        quiet: true,
      }
    );

    const markdown = await readFile(outputPath, "utf-8");

    return {
      markdown,
      tokenCount: result?.packResult?.totalTokens ?? estimateTokens(markdown),
      fileCount: result?.packResult?.totalFiles ?? 0,
      repoUrl,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.round(text.length / 4);
}
