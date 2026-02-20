"use client";

import { useState } from "react";
import { RepoInput } from "@/components/RepoInput";
import {
  AnalysisProgress,
  type ProgressStage,
} from "@/components/AnalysisProgress";
import { ClarifyingQuestions } from "@/components/ClarifyingQuestions";
import { SkillPreview } from "@/components/SkillPreview";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type AppState = "input" | "processing" | "questions" | "result";

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
  };
}

export default function Home() {
  const [state, setState] = useState<AppState>("input");
  const [stage, setStage] = useState<ProgressStage>("cloning");
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [skillData, setSkillData] = useState<SkillData | null>(null);

  const handleSubmit = async (repoUrl: string) => {
    setState("processing");
    setStage("cloning");
    setError(null);

    try {
      // Step 1: Analyze
      setStage("cloning");
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "Analysis failed");
      }

      setStage("analyzing");
      const data: AnalysisData = await analyzeRes.json();
      setAnalysisData(data);
      setState("questions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("input");
    }
  };

  const handleAnswersSubmit = async (answers: Record<string, string>) => {
    if (!analysisData) return;

    setState("processing");
    setStage("generating");
    setError(null);

    try {
      const generateRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: analysisData.analysis,
          answers,
          repoMarkdown: analysisData.repoMarkdown,
        }),
      });

      if (!generateRes.ok) {
        const err = await generateRes.json();
        throw new Error(err.error || "Generation failed");
      }

      const result: SkillData = await generateRes.json();
      setSkillData(result);
      setState("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("questions");
    }
  };

  const handleReset = () => {
    setState("input");
    setStage("cloning");
    setError(null);
    setAnalysisData(null);
    setSkillData(null);
  };

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
            href="https://github.com"
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
                Claude skill file (SKILL.md + reference files) using Repomix and
                Claude Sonnet 4.6. No signup. No paywall. Paste and go.
              </p>
            </div>
          </div>
        )}

        {/* State: Processing */}
        {state === "processing" && (
          <AnalysisProgress
            stage={stage}
            fileCount={analysisData?.repomixMeta?.fileCount}
            tokenCount={analysisData?.repomixMeta?.tokenCount}
          />
        )}

        {/* State: Questions */}
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
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-muted-foreground/60">
          <span>ShadowOSS</span>
          <span>
            Powered by Repomix + Claude Sonnet 4.6 via Vertex AI
          </span>
        </div>
      </footer>
    </main>
  );
}
