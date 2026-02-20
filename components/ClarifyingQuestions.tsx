"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface Question {
  id: string;
  question: string;
  options: string[] | null;
  multiSelect: boolean;
}

interface AnalysisSummary {
  summary: string;
  language: string;
  framework: string | null;
  projectType: string;
}

interface RecommendedArchitecture {
  type: string;
  files: Array<{ name: string; purpose: string }>;
}

interface ClarifyingQuestionsProps {
  analysis: AnalysisSummary;
  questions: Question[];
  architecture: RecommendedArchitecture;
  onSubmit: (answers: Record<string, string>) => void;
  disabled?: boolean;
}

export function ClarifyingQuestions({
  analysis,
  questions,
  architecture,
  onSubmit,
  disabled,
}: ClarifyingQuestionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const validQuestions = questions.filter(
    (q) => q.question && q.options && q.options.length > 0
  );

  const allAnswered = validQuestions.every((q) => answers[q.id]);

  const handleSelect = (questionId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8">
      {/* Analysis Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Repository Analysis</CardTitle>
          <CardDescription>{analysis.summary}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 font-medium">
              {analysis.language}
            </span>
            {analysis.framework && (
              <span className="px-2.5 py-1 rounded-md bg-secondary border border-border">
                {analysis.framework}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-md bg-secondary border border-border">
              {analysis.projectType}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      {validQuestions.map((q) => (
        <div key={q.id} className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">{q.question}</h3>
          <div className="grid gap-2">
            {q.options!.map((option) => {
              const isSelected = answers[q.id] === option;
              return (
                <button
                  key={option}
                  onClick={() => handleSelect(q.id, option)}
                  disabled={disabled}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
                  } disabled:opacity-50`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Architecture Preview */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recommended Architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-xs space-y-1 text-muted-foreground">
            {architecture.files.map((f) => (
              <div key={f.name} className="flex gap-3">
                <span className="text-foreground">{f.name}</span>
                <span className="text-muted-foreground/60">— {f.purpose}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-center">
        <Button
          onClick={() => onSubmit(answers)}
          disabled={disabled || !allAnswered}
          size="lg"
        >
          Generate Skill
        </Button>
      </div>
    </div>
  );
}
