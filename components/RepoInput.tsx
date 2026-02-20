"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RepoInputProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

const EXAMPLE_REPOS = [
  { name: "pallets/flask", desc: "Python web framework" },
  { name: "shadcn-ui/ui", desc: "React components" },
  { name: "BurntSushi/ripgrep", desc: "Rust CLI tool" },
];

function isValidGithubUrl(url: string): boolean {
  const cleaned = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /^(github\.com\/)?[\w.-]+\/[\w.-]+$/.test(cleaned);
}

function normalizeUrl(url: string): string {
  let cleaned = url.trim().replace(/\/$/, "");
  if (!cleaned.startsWith("http")) {
    if (!cleaned.startsWith("github.com")) {
      cleaned = `https://github.com/${cleaned}`;
    } else {
      cleaned = `https://${cleaned}`;
    }
  }
  return cleaned;
}

export function RepoInput({ onSubmit, disabled }: RepoInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const validate = (): string | null => {
    if (!url.trim()) return "Enter a GitHub repository URL";
    if (!isValidGithubUrl(url)) return "Enter a valid GitHub repo (e.g. owner/repo)";
    return null;
  };

  const handleSubmit = () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    onSubmit(normalizeUrl(url));
  };

  const handleExampleClick = (name: string) => {
    setUrl(name);
    setError("");
    onSubmit(`https://github.com/${name}`);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex gap-3"
      >
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError("");
          }}
          placeholder="github.com/owner/repo"
          disabled={disabled}
          className="flex-1 font-mono text-sm"
          autoFocus
        />
        <Button
          type="submit"
          disabled={disabled || !url.trim()}
          size="lg"
        >
          Generate
        </Button>
      </form>

      {error && (
        <p className="text-destructive text-sm mt-2">{error}</p>
      )}

      <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <span>Try:</span>
        {EXAMPLE_REPOS.map((repo) => (
          <button
            key={repo.name}
            onClick={() => handleExampleClick(repo.name)}
            disabled={disabled}
            className="px-2.5 py-1 rounded-md border border-border bg-secondary hover:bg-muted transition-colors text-xs font-mono text-foreground disabled:opacity-50 cursor-pointer"
          >
            {repo.name}
          </button>
        ))}
      </div>
    </div>
  );
}
