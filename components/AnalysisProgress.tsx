"use client";

import { Spinner } from "@/components/ui/spinner";

export type ProgressStage =
  | "cloning"
  | "extracting"
  | "packed"
  | "analyzing"
  | "generating";

interface AnalysisProgressProps {
  stage: ProgressStage;
  fileCount?: number;
  tokenCount?: number;
}

const STAGE_MESSAGES: Record<ProgressStage, string> = {
  cloning: "Cloning repository via Repomix...",
  extracting: "Extracting code structure (Tree-sitter compression)...",
  packed: "Packed files into tokens",
  analyzing: "Claude is analyzing the codebase...",
  generating: "Generating skill files...",
};

const STAGE_ORDER: ProgressStage[] = [
  "cloning",
  "extracting",
  "packed",
  "analyzing",
  "generating",
];

export function AnalysisProgress({
  stage,
  fileCount,
  tokenCount,
}: AnalysisProgressProps) {
  const currentIndex = STAGE_ORDER.indexOf(stage);

  return (
    <div className="w-full max-w-lg mx-auto py-16">
      <div className="flex flex-col items-center gap-6">
        <Spinner size="lg" />

        <div className="space-y-3 w-full">
          {STAGE_ORDER.map((s, i) => {
            const isActive = i === currentIndex;
            const isDone = i < currentIndex;
            const isPending = i > currentIndex;

            let message = STAGE_MESSAGES[s];
            if (s === "packed" && fileCount && tokenCount) {
              message = `Packed ${fileCount} files into ${tokenCount.toLocaleString()} tokens`;
            }

            return (
              <div
                key={s}
                className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                  isActive
                    ? "text-foreground"
                    : isDone
                    ? "text-muted-foreground"
                    : isPending
                    ? "text-muted-foreground/40"
                    : ""
                }`}
              >
                <span className="w-5 text-center">
                  {isDone ? (
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isActive ? (
                    <span className="block w-2 h-2 rounded-full bg-primary animate-pulse mx-auto" />
                  ) : (
                    <span className="block w-2 h-2 rounded-full bg-muted mx-auto" />
                  )}
                </span>
                <span className={isActive ? "font-medium" : ""}>{message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
