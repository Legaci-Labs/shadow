import { readFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Claude's context is 200K tokens; leave room for system prompt + response
const MAX_TOKENS = 120_000;
const MAX_CHARS = MAX_TOKENS * 4; // ~4 chars per token

export interface RepomixResult {
  markdown: string;
  tokenCount: number;
  fileCount: number;
  repoUrl: string;
  truncated: boolean;
}

// Ignore patterns as comma-separated string (repomix CLI format)
const IGNORE_PATTERNS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/test/**",
  "**/tests/**",
  "docs/**",
  "examples/**",
  "example/**",
  "benchmarks/**",
  "fixtures/**",
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.lock",
  "**/dist/**",
  "**/build/**",
  "**/vendor/**",
  "**/node_modules/**",
  "**/.git/**",
  "**/CHANGELOG*",
].join(",");

export async function convertRepoToMarkdown(
  repoUrl: string
): Promise<RepomixResult> {
  const tempDir = await mkdtemp(join(tmpdir(), "shadowoss-"));
  const outputPath = join(tempDir, "repo.md");

  try {
    const { runCli } = await import("repomix");

    // tree-sitter WASM modules aren't available on Vercel serverless,
    // so disable compress (which requires tree-sitter) in production
    const isVercel = !!process.env.VERCEL;

    let result;
    try {
      result = await runCli(["."], process.cwd(), {
        remote: repoUrl,
        output: outputPath,
        style: "markdown",
        compress: !isVercel,
        removeComments: true,
        removeEmptyLines: true,
        truncateBase64: true,
        ignore: IGNORE_PATTERNS,
        quiet: true,
      });
    } catch (err) {
      let msg: string;
      if (err instanceof Error) {
        msg = err.message;
      } else if (typeof err === "object" && err !== null) {
        msg = JSON.stringify(err).slice(0, 500);
      } else {
        msg = String(err);
      }
      throw new Error(`Repomix failed: ${msg}`);
    }

    let markdown = await readFile(outputPath, "utf-8");
    const rawTokens =
      result?.packResult?.totalTokens ?? estimateTokens(markdown);
    const fileCount = result?.packResult?.totalFiles ?? 0;
    let truncated = false;

    // Strip any remaining base64 blobs (e.g. from .ipynb embedded images)
    markdown = stripBase64Blobs(markdown);

    // Truncate if still too large
    if (markdown.length > MAX_CHARS) {
      markdown = truncateMarkdown(markdown, MAX_CHARS);
      truncated = true;
    }

    return {
      markdown,
      tokenCount: truncated ? estimateTokens(markdown) : rawTokens,
      fileCount,
      repoUrl,
      truncated,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function estimateTokens(text: string): number {
  return Math.round(text.length / 4);
}

/**
 * Strip base64-encoded blobs that inflate token count (common in .ipynb files).
 * Matches data URIs and long base64 strings embedded in JSON.
 */
function stripBase64Blobs(text: string): string {
  // Replace data:image/...;base64,<blob> patterns
  text = text.replace(
    /data:[a-zA-Z0-9/+.-]+;base64,[A-Za-z0-9+/=\n]{200,}/g,
    "[base64 image removed]"
  );
  // Replace long base64 strings in JSON (e.g. "image/png": "iVBOR...")
  text = text.replace(
    /"[A-Za-z0-9+/=\n]{500,}"/g,
    '"[base64 data removed]"'
  );
  return text;
}

/**
 * Truncate markdown intelligently: keep the directory tree + as many
 * files as fit within the character budget.
 */
function truncateMarkdown(markdown: string, maxChars: number): string {
  // Try to preserve the directory tree section (usually at the top)
  const treeSeparator = "## File Contents";
  const treeEnd = markdown.indexOf(treeSeparator);

  if (treeEnd > 0 && treeEnd < maxChars * 0.3) {
    const tree = markdown.slice(0, treeEnd + treeSeparator.length);
    const remaining = maxChars - tree.length - 200;
    const content = markdown.slice(treeEnd + treeSeparator.length);
    return (
      tree +
      content.slice(0, remaining) +
      "\n\n---\n\n*[Output truncated — repository too large. Showing first portion of files.]*\n"
    );
  }

  return (
    markdown.slice(0, maxChars - 100) +
    "\n\n---\n\n*[Output truncated — repository too large.]*\n"
  );
}
