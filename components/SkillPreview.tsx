"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FileTree } from "./FileTree";
import { DownloadButton } from "./DownloadButton";
import { Button } from "@/components/ui/button";

interface SkillFile {
  path: string;
  content: string;
}

interface SkillMetadata {
  skillName: string;
  totalLines: number;
  fileCount: number;
  estimatedTriggerPhrases: string[];
  relatedRepos?: Array<{
    name: string;
    url: string;
    relationship: string;
  }>;
}

interface SkillPreviewProps {
  files: SkillFile[];
  metadata: SkillMetadata;
  onReset: () => void;
}

export function SkillPreview({ files, metadata, onReset }: SkillPreviewProps) {
  const [selectedFile, setSelectedFile] = useState(files[0]?.path ?? "");
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");
  const [copied, setCopied] = useState(false);

  const currentFile = files.find((f) => f.path === selectedFile);

  const handleCopy = async () => {
    const skillFile = files.find((f) => f.path === "SKILL.md");
    if (skillFile) {
      await navigator.clipboard.writeText(skillFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">{metadata.skillName}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {metadata.fileCount} files &middot; {metadata.totalLines} lines
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy SKILL.md"}
          </Button>
          <DownloadButton files={files} skillName={metadata.skillName} />
          <Button variant="ghost" size="sm" onClick={onReset}>
            Start Over
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-4 min-h-[600px]">
        {/* File Tree Sidebar */}
        <div className="w-56 shrink-0 border border-border rounded-xl bg-card p-3 overflow-y-auto">
          <FileTree
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
          />
        </div>

        {/* Preview Panel */}
        <div className="flex-1 border border-border rounded-xl bg-card overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/30">
            <span className="font-mono text-xs text-muted-foreground mr-auto truncate">
              {selectedFile}
            </span>
            <button
              onClick={() => setViewMode("preview")}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === "preview"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setViewMode("raw")}
              className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === "raw"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Raw
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(600px-44px)]">
            {currentFile && viewMode === "preview" ? (
              <div className="markdown-body">
                <ReactMarkdown
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const code = String(children).replace(/\n$/, "");

                      if (match) {
                        return (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{
                              margin: 0,
                              borderRadius: "0.5rem",
                              fontSize: "0.875rem",
                            }}
                          >
                            {code}
                          </SyntaxHighlighter>
                        );
                      }

                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {currentFile.content}
                </ReactMarkdown>
              </div>
            ) : currentFile ? (
              <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {currentFile.content}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm">
                Select a file to preview
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Trigger Phrases */}
      {metadata.estimatedTriggerPhrases.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Estimated trigger phrases
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {metadata.estimatedTriggerPhrases.map((phrase) => (
              <span
                key={phrase}
                className="px-2 py-0.5 rounded text-xs bg-secondary border border-border text-muted-foreground"
              >
                {phrase}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
