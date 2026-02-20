"use client";

import { Button } from "@/components/ui/button";
import { generateZip } from "@/lib/zip";
import type { SkillFile } from "@/lib/types";

interface DownloadButtonProps {
  files: SkillFile[];
  skillName: string;
}

export function DownloadButton({ files, skillName }: DownloadButtonProps) {
  const handleDownload = async () => {
    const blob = await generateZip(skillName, files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${skillName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Button onClick={handleDownload} size="sm">
      Download ZIP
    </Button>
  );
}
