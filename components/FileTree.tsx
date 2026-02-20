"use client";

interface FileTreeProps {
  files: Array<{ path: string; content: string }>;
  selectedFile: string;
  onSelectFile: (path: string) => void;
}

function FileIcon({ path }: { path: string }) {
  const isDir = path.includes("/") && !path.split("/").pop()?.includes(".");
  const ext = path.split(".").pop();

  if (isDir || path.endsWith("/")) {
    return (
      <svg className="w-4 h-4 text-primary/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    );
  }

  const color = ext === "md" ? "text-blue-400" : "text-muted-foreground";

  return (
    <svg className={`w-4 h-4 ${color} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

export function FileTree({ files, selectedFile, onSelectFile }: FileTreeProps) {
  // Group files by directory
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    if (parts.length > 1) {
      dirs.add(parts[0]);
    }
  }

  const topLevel = files.filter((f) => !f.path.includes("/"));
  const grouped: Record<string, typeof files> = {};

  for (const dir of dirs) {
    grouped[dir] = files.filter(
      (f) => f.path.startsWith(dir + "/")
    );
  }

  return (
    <div className="space-y-0.5 text-sm">
      {/* Top-level files first */}
      {topLevel.map((f) => (
        <button
          key={f.path}
          onClick={() => onSelectFile(f.path)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
            selectedFile === f.path
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <FileIcon path={f.path} />
          <span className="font-mono text-xs truncate">{f.path}</span>
        </button>
      ))}

      {/* Grouped by directory */}
      {Object.entries(grouped).map(([dir, dirFiles]) => (
        <div key={dir}>
          <div className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground/60">
            <FileIcon path={dir + "/"} />
            <span className="font-mono text-xs font-medium">{dir}/</span>
          </div>
          {dirFiles.map((f) => {
            const fileName = f.path.split("/").slice(1).join("/");
            return (
              <button
                key={f.path}
                onClick={() => onSelectFile(f.path)}
                className={`w-full flex items-center gap-2 pl-7 pr-3 py-1.5 rounded-md text-left transition-colors cursor-pointer ${
                  selectedFile === f.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <FileIcon path={f.path} />
                <span className="font-mono text-xs truncate">{fileName}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
