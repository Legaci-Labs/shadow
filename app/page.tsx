"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { RepoInput } from "@/components/RepoInput";
import { ClarifyingQuestions } from "@/components/ClarifyingQuestions";
import { SkillPreview } from "@/components/SkillPreview";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

type AppState = "input" | "processing" | "questions" | "generating" | "result";

interface AnalysisData {
  analysis: {
    summary: string;
    language: string;
    framework: string | null;
    projectType: string;
    apiSurface: Array<{ name: string; type: string; description: string }>;
    workflows: Array<{ name: string; steps: string }>;
    concepts: string[];
    integrations: string[];
    configPatterns: string[];
  };
  questions: Array<{
    id: string;
    question: string;
    options: string[] | null;
    multiSelect: boolean;
  }>;
  recommendedArchitecture: {
    type: string;
    files: Array<{ name: string; purpose: string }>;
  };
  repoMarkdown: string;
  repomixMeta: {
    tokenCount: number;
    fileCount: number;
  };
}

interface SkillData {
  files: Array<{ path: string; content: string }>;
  metadata: {
    skillName: string;
    totalLines: number;
    fileCount: number;
    estimatedTriggerPhrases: string[];
    relatedRepos: Array<{
      name: string;
      url: string;
      relationship: string;
    }>;
  };
}

interface StatusInfo {
  stage: string;
  message: string;
  fileCount?: number;
  tokenCount?: number;
}

const CHUNK_SIZE = 2000;

export default function Home() {
  const [state, setState] = useState<AppState>("input");
  const [error, setError] = useState<string | null>(null);
  const [skillData, setSkillData] = useState<SkillData | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [status, setStatus] = useState<StatusInfo>({
    stage: "cloning",
    message: "Cloning repository...",
  });
  const [streamedText, setStreamedText] = useState("");
  const [displayedText, setDisplayedText] = useState("");
  const streamBufferRef = useRef("");
  const lastFlushedRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const streamPaneRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the stream pane
  useEffect(() => {
    if (streamPaneRef.current) {
      streamPaneRef.current.scrollTop = streamPaneRef.current.scrollHeight;
    }
  }, [displayedText]);

  // Flush buffer in 2K blocks
  useEffect(() => {
    const len = streamedText.length;
    const nextFlush = lastFlushedRef.current + CHUNK_SIZE;
    if (len >= nextFlush || (state === "result" && len > lastFlushedRef.current)) {
      setDisplayedText(streamedText);
      lastFlushedRef.current = len;
    }
  }, [streamedText, state]);

  // ── SSE helpers ──
  const handleSSEEvent = useCallback((event: string, data: Record<string, unknown>, errorFallbackState: AppState = "input") => {
    switch (event) {
      case "status":
        setStatus({
          stage: data.stage as string,
          message: data.message as string,
          fileCount: data.fileCount as number | undefined,
          tokenCount: data.tokenCount as number | undefined,
        });
        break;
      case "chunk":
        streamBufferRef.current += data.text as string;
        setStreamedText(streamBufferRef.current);
        break;
      case "complete":
        setSkillData(data as unknown as SkillData);
        setState("result");
        break;
      case "error":
        setError(data.message as string);
        setState(errorFallbackState);
        break;
    }
  }, []);

  const readSSEStream = useCallback(async (res: Response, fallbackState: AppState) => {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response stream");

    const decoder = new TextDecoder();
    let buffer = "";
    let gotComplete = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let eventType = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7);
        } else if (line.startsWith("data: ") && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            if (eventType === "complete" || eventType === "error") gotComplete = true;
            handleSSEEvent(eventType, data, fallbackState);
          } catch {
            // Skip malformed
          }
          eventType = "";
        }
      }
    }

    // Stream ended without a complete/error event — connection was dropped
    if (!gotComplete) {
      setError("Connection lost. The server may have timed out. Please try again.");
      setState(fallbackState);
    }
  }, [handleSSEEvent]);

  // ── Quick Generate (SSE streaming, single call) ──
  const handleQuickGenerate = useCallback(async (repoUrl: string) => {
    setState("processing");
    setError(null);
    setSkillData(null);
    setStreamedText("");
    setDisplayedText("");
    streamBufferRef.current = "";
    lastFlushedRef.current = 0;
    setStatus({ stage: "cloning", message: "Cloning repository..." });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = "Request failed";
        try { msg = JSON.parse(text).error || msg; } catch { msg = text.slice(0, 200) || msg; }
        throw new Error(msg);
      }

      await readSSEStream(res, "input");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("input");
    }
  }, [readSSEStream]);

  // ── Refine flow (2-step: analyze via SSE → questions → generate) ──
  const handleRefine = useCallback(async (repoUrl: string) => {
    setState("processing");
    setError(null);
    setSkillData(null);
    setAnalysisData(null);
    setStreamedText("");
    setDisplayedText("");
    streamBufferRef.current = "";
    lastFlushedRef.current = 0;
    setStatus({ stage: "cloning", message: "Cloning repository..." });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
        signal: abort.signal,
      });

      if (!analyzeRes.ok) {
        const text = await analyzeRes.text();
        let msg = "Analysis failed";
        try { msg = JSON.parse(text).error || msg; } catch { msg = text.slice(0, 200) || msg; }
        throw new Error(msg);
      }

      // Read SSE stream from analyze endpoint
      const reader = analyzeRes.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === "status") {
                setStatus({
                  stage: data.stage as string,
                  message: data.message as string,
                  fileCount: data.fileCount as number | undefined,
                  tokenCount: data.tokenCount as number | undefined,
                });
              } else if (eventType === "complete") {
                setAnalysisData(data as AnalysisData);
                setState("questions");
              } else if (eventType === "error") {
                setError(data.message as string);
                setState("input");
              }
            } catch {
              // Skip malformed
            }
            eventType = "";
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("input");
    }
  }, []);

  const handleAnswersSubmit = useCallback(
    async (answers: Record<string, string>) => {
      if (!analysisData) return;

      setState("generating");
      setError(null);
      setStreamedText("");
      setDisplayedText("");
      streamBufferRef.current = "";
      lastFlushedRef.current = 0;
      setStatus({ stage: "generating", message: "Generating skill files..." });

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysis: analysisData.analysis,
            answers,
            repoMarkdown: analysisData.repoMarkdown,
          }),
          signal: abort.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          let msg = "Generation failed";
          try { msg = JSON.parse(text).error || msg; } catch { msg = text.slice(0, 200) || msg; }
          throw new Error(msg);
        }

        await readSSEStream(res, "questions");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
        setState("questions");
      }
    },
    [analysisData, readSSEStream]
  );

  // ── Submit handler dispatches to quick or refine ──
  const handleSubmit = useCallback(
    (repoUrl: string, mode: "quick" | "refine") => {
      if (mode === "quick") {
        handleQuickGenerate(repoUrl);
      } else {
        handleRefine(repoUrl);
      }
    },
    [handleQuickGenerate, handleRefine]
  );

  const handleReset = () => {
    abortRef.current?.abort();
    setState("input");
    setError(null);
    setSkillData(null);
    setAnalysisData(null);
    setStreamedText("");
    setDisplayedText("");
    streamBufferRef.current = "";
    lastFlushedRef.current = 0;
  };

  const isStreaming = state === "processing" || state === "generating";

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={handleReset} className="cursor-pointer">
            <h1 className="text-lg font-bold tracking-tight">
              Shadow<span className="text-primary">OSS</span>
            </h1>
          </button>
          <a
            href="https://github.com/legaci-labs/shadow"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Error */}
        {error && (
          <div className="mb-8 max-w-2xl mx-auto">
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* State: Input */}
        {state === "input" && (
          <div className="py-24 text-center">
            <h2 className="text-5xl font-bold tracking-tight mb-4">
              Shadow<span className="text-primary">OSS</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-12 max-w-xl mx-auto">
              Drop a GitHub repo. Get an AI skill file.
              <br />
              Make Claude actually understand your code.
            </p>
            <RepoInput onSubmit={handleSubmit} />
            <div className="mt-16 max-w-lg mx-auto">
              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                ShadowOSS converts any public GitHub repository into a structured
                Claude skill file (SKILL.md + reference files).
              </p>
            </div>
          </div>
        )}

        {/* State: Processing / Generating (with live stream preview) */}
        {isStreaming && (
          <div className="flex gap-6 min-h-[600px]">
            {/* Left: Status */}
            <div className="w-64 shrink-0 flex flex-col items-center pt-12 gap-5">
              <Spinner size="lg" />

              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {status.message}
                </p>

                {status.fileCount != null && status.tokenCount != null && (
                  <p className="text-xs text-muted-foreground">
                    {status.fileCount} files &middot;{" "}
                    {status.tokenCount.toLocaleString()} tokens
                  </p>
                )}

                {streamedText.length > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">
                    <span className="text-primary">
                      {Math.round(streamedText.length / 1000)}k
                    </span>{" "}
                    chars
                  </p>
                )}
              </div>

              {streamedText.length > 0 && (
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.min(95, (streamedText.length / 60000) * 100)}%`,
                    }}
                  />
                </div>
              )}

              <button
                onClick={handleReset}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-4 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {/* Right: Live stream output */}
            <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono">
                  Skill output
                </span>
                {streamedText.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/50 font-mono">
                    streaming...
                  </span>
                )}
              </div>
              <div
                ref={streamPaneRef}
                className="p-4 overflow-y-auto max-h-[calc(600px-40px)]"
              >
                {displayedText ? (
                  <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed break-words">
                    {displayedText}
                    <span className="inline-block w-1.5 h-4 bg-primary/70 animate-pulse align-middle ml-0.5" />
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full min-h-[200px] text-muted-foreground/40 text-sm">
                    Getting vibes from the Gitship
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* State: Questions (refine flow) */}
        {state === "questions" && analysisData && (
          <div className="py-8">
            <ClarifyingQuestions
              analysis={analysisData.analysis}
              questions={analysisData.questions}
              architecture={analysisData.recommendedArchitecture}
              onSubmit={handleAnswersSubmit}
            />
          </div>
        )}

        {/* State: Result */}
        {state === "result" && skillData && (
          <div className="py-8">
            <SkillPreview
              files={skillData.files}
              metadata={skillData.metadata}
              onReset={handleReset}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6" />
      </footer>
    </main>
  );
}
