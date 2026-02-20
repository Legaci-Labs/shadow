# **Claude Code Prompt: Build "ShadowOSS" — Generate Claude Skills from Any GitHub Repo**

## **What You're Building**

A single-page web app called **ShadowOSS** that takes a public GitHub repo URL, converts it to structured markdown via Repomix, asks 2-3 clarifying questions, and generates a complete Claude skill architecture (SKILL.md \+ reference files) that makes Claude deeply understand that project.

The tagline: **"Drop a GitHub repo. Get an AI skill file from any OSS project."**

Domain: **shadow-oss.info** (registered on Namecheap, hosted on Vercel)

## **Tech Stack**

* **Framework**: Next.js 15 (App Router)  
* **Styling**: Tailwind CSS v4 with components from COSS (https://github.com/cosscom/coss)  
* **AI**: Claude Sonnet 4.6 via GCP Vertex AI (`claude-sonnet-4-6`)  
* **Repo ingestion**: Repomix (used as a Node.js library)  
* **Deployment**: Vercel → custom domain shadow-oss.info via Namecheap DNS  
* **Package manager**: pnpm

No database. No auth. No accounts. Fully stateless.

---

## **Claude API: GCP Vertex AI Configuration**

ShadowOSS calls Claude Sonnet 4.6 through Google Cloud Vertex AI

### **SDK Setup**

Use the `@anthropic-ai/vertex-sdk` package 

```ts
import AnthropicVertex from '@anthropic-ai/vertex-sdk';

const client = new AnthropicVertex({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
  region: process.env.GOOGLE_CLOUD_REGION ?? 'global',
});

const message = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  messages: [
    { role: 'user', content: 'Your prompt here' }
  ],
});
```

### **Authentication**

Vertex AI authenticates via Google Cloud Application Default Credentials (ADC).. For Vercel deployment, use a GCP service account:

1. Create a service account in GCP with `Vertex AI User` role  
2. Generate a JSON key file  
3. Base64-encode it and set as `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var in Vercel  
4. At runtime, decode and write to a temp file, then set `GOOGLE_APPLICATION_CREDENTIALS`

```ts
// lib/vertex-auth.ts
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export function ensureVertexCredentials(): void {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credentialsJson) return; // Assume ADC is already configured

  const credPath = join(tmpdir(), 'vertex-credentials.json');
  if (!existsSync(credPath)) {
    writeFileSync(credPath, Buffer.from(credentialsJson, 'base64').toString('utf-8'));
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
}
```

Call `ensureVertexCredentials()` at the top of each API route before creating the client.

### **Environment Variables**

```
# .env.local
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id       # Required
GOOGLE_CLOUD_REGION=global                          # Optional, defaults to 'global'
GOOGLE_APPLICATION_CREDENTIALS_JSON=base64encoded   # Required for Vercel (base64 of service account JSON)
```

### **Model ID**

Use `claude-sonnet-4-6` as the model string. This is the Vertex AI model ID for Claude Sonnet 4.6. Do NOT use `claude-sonnet-4-20250514` or any Anthropic-direct model ID format.

### **Key Differences from Direct Anthropic API**

| Aspect | Direct Anthropic | Vertex AI (what we use) |
| ----- | ----- | ----- |
| SDK | `@anthropic-ai/sdk` | `@anthropic-ai/vertex-sdk` |
| Auth | `ANTHROPIC_API_KEY` | GCP ADC (service account) |
| Model ID | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |
| Client | `new Anthropic()` | `new AnthropicVertex({ projectId, region })` |
| API surface | Identical `messages.create()` | Identical `messages.create()` |

The messages API surface is identical — same parameters, same response format. Only initialization and auth differ.

---

## **Styling: Tailwind CSS v4 \+ COSS Components**

### **About COSS**

COSS (https://github.com/cosscom/coss) is the component library from coss.com (formerly Origin UI, the holding company of cal.com). It provides beautifully designed, accessible, composable React components built on Base UI and styled with Tailwind CSS. The components follow a copy-paste-own philosophy similar to shadcn/ui.

The component source is in `apps/ui/` and `packages/ui/` within the COSS monorepo.

### **How to Use COSS Components**

COSS components are designed to be copied into your project (not installed as an npm package). During project setup:

1. Browse the COSS UI documentation at https://coss.com/ui  
2. Identify the components ShadowOSS needs (see list below)  
3. Copy the component source files into `components/ui/` in the ShadowOSS project  
4. Adapt imports to local paths

### **Required COSS Components**

Pull these components from the COSS repo for the ShadowOSS UI:

| ShadowOSS Feature | COSS Component(s) |
| ----- | ----- |
| Repo URL input | Input, Button |
| Loading/progress | Spinner/Loading indicator |
| Clarifying questions (card selection) | Card, RadioGroup or Toggle |
| File tree sidebar | Tree view (or build custom with COSS primitives) |
| Code/markdown preview tabs | Tabs |
| Download/copy buttons | Button variants |
| Alert/error messages | Alert, Toast |
| Layout containers | Card, Separator |

If COSS doesn't have a specific component you need (like a file tree), build it using COSS design tokens and Tailwind classes to match the COSS aesthetic. The key visual characteristics of COSS components are:

* Clean, minimal borders (subtle gray borders, not heavy outlines)  
* Smooth, small border radius (typically rounded-lg or rounded-xl)  
* Restrained color palette with clear hover/active states  
* Focus rings for accessibility  
* Consistent spacing using Tailwind's spacing scale

### **Design Direction**

* **Dark mode by default** — developer tool aesthetic  
* **COSS component styling** — use the COSS design language throughout  
* **Typography**: Monospace for code previews (JetBrains Mono from Google Fonts), sans-serif for UI (Inter or whatever COSS uses as its default)  
* **Accent color**: Match COSS's primary color system, or use electric blue (\#3B82F6)  
* **Responsive but desktop-first** (this is a developer tool)  
* **Subtle animations** on state transitions (fade, not flashy)

---

## **Domain & Deployment: shadow-oss.info on Vercel**

### **Vercel Setup**

1. Deploy the Next.js app to Vercel as usual (`vercel` or connect GitHub repo)  
2. In Vercel dashboard → Project Settings → Domains → Add `shadow-oss.info` and `www.shadow-oss.info`  
3. Vercel will provide DNS records to configure

### **Namecheap DNS Configuration**

In Namecheap → Domain List → shadow-oss.info → Advanced DNS:

| Type | Host | Value | TTL |
| ----- | ----- | ----- | ----- |
| A | @ | 76.76.21.21 | Automatic |
| CNAME | www | cname.vercel-dns.com. | Automatic |

These are Vercel's standard DNS records. After setting, wait for propagation (usually \<30min).

### **Vercel Environment Variables**

Set these in Vercel dashboard → Project Settings → Environment Variables:

| Variable | Value | Environment |
| ----- | ----- | ----- |
| `GOOGLE_CLOUD_PROJECT_ID` | your-gcp-project-id | Production, Preview |
| `GOOGLE_CLOUD_REGION` | global | Production, Preview |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | base64-encoded-service-account-json | Production, Preview |

---

## **Project Structure**

```
shadowoss/
├── app/
│   ├── layout.tsx                 # Root layout, metadata, fonts, COSS theme
│   ├── page.tsx                   # Main single-page app
│   ├── api/
│   │   ├── analyze/route.ts       # Step 1: Repomix → Claude analysis → questions
│   │   └── generate/route.ts      # Step 2: Answers + markdown → skill files
│   └── globals.css                # Tailwind v4 + COSS base styles
├── components/
│   ├── ui/                        # COSS components (copied from cosscom/coss)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── tabs.tsx
│   │   ├── alert.tsx
│   │   └── ... (other COSS components as needed)
│   ├── RepoInput.tsx              # URL input + submit (uses COSS Input + Button)
│   ├── AnalysisProgress.tsx       # Loading state (uses COSS Spinner)
│   ├── ClarifyingQuestions.tsx     # Multiple choice questions (uses COSS Card)
│   ├── SkillPreview.tsx           # Rendered preview (uses COSS Tabs)
│   ├── FileTree.tsx               # Visual file tree
│   └── DownloadButton.tsx         # Download as zip (uses COSS Button)
├── lib/
│   ├── vertex-auth.ts             # GCP Vertex credential setup
│   ├── vertex-client.ts           # AnthropicVertex client factory
│   ├── repomix.ts                 # Repomix library integration
│   ├── analyzer.ts                # Claude call #1: repo markdown → questions
│   ├── generator.ts               # Claude call #2: answers → skill files
│   ├── prompts.ts                 # System prompts for both Claude calls
│   └── zip.ts                     # Generate downloadable zip from skill files
├── .env.local                     # GCP credentials (local dev)
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts             # Tailwind v4 + COSS theme tokens
```

---

## **Detailed Implementation**

### **1\. Vertex AI Client (`lib/vertex-client.ts`)**

Centralized client factory used by both analyzer and generator:

```ts
import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import { ensureVertexCredentials } from './vertex-auth';

let _client: AnthropicVertex | null = null;

export function getVertexClient(): AnthropicVertex {
  if (!_client) {
    ensureVertexCredentials();
    _client = new AnthropicVertex({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      region: process.env.GOOGLE_CLOUD_REGION ?? 'global',
    });
  }
  return _client;
}

export const MODEL_ID = 'claude-sonnet-4-6';
```

---

### **2\. Repomix Integration (`lib/repomix.ts`)**

Use Repomix as a Node.js library to convert any GitHub repo URL into structured markdown.

```ts
import { runCli, type CliOptions } from 'repomix';
import { readFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface RepomixResult {
  markdown: string;
  tokenCount: number;
  fileCount: number;
  repoUrl: string;
}

export async function convertRepoToMarkdown(repoUrl: string): Promise<RepomixResult> {
  const tempDir = await mkdtemp(join(tmpdir(), 'shadowoss-'));
  const outputPath = join(tempDir, 'repo.md');

  try {
    const options: CliOptions = {
      remote: repoUrl,
      output: outputPath,
      style: 'markdown',
      compress: true,          // Tree-sitter extraction: classes, functions, interfaces
      removeComments: false,   // Keep comments — they contain intent/docs
      removeEmptyLines: true,  // Save tokens
      quiet: true,
    };

    const result = await runCli(['.'], process.cwd(), options);
    const markdown = await readFile(outputPath, 'utf-8');

    return {
      markdown,
      tokenCount: result.packResult?.totalTokens ?? 0,
      fileCount: result.packResult?.totalFiles ?? 0,
      repoUrl,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

**Key Repomix options:**

| Option | Value | Why |
| ----- | ----- | ----- |
| `compress` | `true` | Tree-sitter extracts code structure (classes, functions, interfaces, types). Reduces tokens \~60-80% while preserving API surface. |
| `style` | `'markdown'` | Structured output with directory tree \+ file headers |
| `removeComments` | `false` | Comments contain documentation and intent |
| `removeEmptyLines` | `true` | Token savings without information loss |

For monorepos exceeding 150K tokens, add filtering:

```ts
const options: CliOptions = {
  remote: repoUrl,
  output: outputPath,
  style: 'markdown',
  compress: true,
  include: ['packages/core/**', 'src/**'],
  ignore: ['**/*.test.*', '**/*.spec.*', 'docs/**', 'examples/**'],
  quiet: true,
};
```

---

### **3\. Repo Analysis — Claude Call \#1 (`lib/analyzer.ts` \+ `lib/prompts.ts`)**

```ts
// lib/analyzer.ts
import { getVertexClient, MODEL_ID } from './vertex-client';

export async function analyzeRepo(repoMarkdown: string) {
  const client = getVertexClient();

  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 4096,
    temperature: 0.3,
    system: ANALYZER_SYSTEM_PROMPT,   // from prompts.ts
    messages: [{
      role: 'user',
      content: `Here is a GitHub repository converted to structured markdown by Repomix:\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nAnalyze this repository and generate clarifying questions for skill file generation.`
    }],
  });

  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  return JSON.parse(text);
}
```

**Analyzer system prompt** (in `lib/prompts.ts`):

```
You are an expert at reverse-engineering codebases and understanding what developers need
to effectively use them with AI assistance.

You will receive a repository's source code that has been converted to structured markdown
by Repomix. The markdown contains:
- A file summary with metadata
- A directory structure tree
- Compressed source files showing classes, functions, interfaces, and type definitions

Your job is to:

1. ANALYZE the repository and produce a structured understanding:
   - What this project does (1-2 sentences)
   - Primary language and framework
   - Project type: SDK/library, CLI tool, web app, API server, framework, data pipeline,
     DevOps tool, documentation site, monorepo, or other
   - Public API surface: key exports, classes, functions, types, commands
   - Core workflows: the 3-5 most common things a developer would do with this project
   - Key concepts and domain terms that a developer needs to understand
   - Dependencies and integrations the project connects to
   - Configuration patterns (env vars, config files, init functions)

2. GENERATE 2-3 clarifying questions (each with 3-4 options) to determine:

   Question 1 — FOCUS: What should the skill primarily help with?
   Generate options based on the actual capabilities found in the repo. Be specific to
   this project — not generic.

   Question 2 — AUDIENCE: What developer level and context?
   Always include these options:
   - "Beginner: step-by-step with full explanations"
   - "Intermediate: patterns and recipes, assumes framework knowledge"
   - "Advanced: architecture guidance, edge cases, performance"
   - "All levels: progressive disclosure from quickstart to advanced"

   Question 3 — ARCHITECTURE (only if 3+ distinct capability areas):
   If the repo is complex enough, ask about skill structure. If it's simple/focused
   (<10 source files), skip this question and default to a single SKILL.md.

3. RECOMMEND a preliminary skill architecture:
   - Small/focused repos: Single SKILL.md, no references
   - Medium repos (3-4 capabilities): SKILL.md + 2-3 reference files
   - Large/complex repos (5+ capabilities): Hub-and-spoke with SKILL.md + 4-6 references

Respond ONLY with valid JSON in this exact structure:

{
  "analysis": {
    "summary": "string",
    "language": "string",
    "framework": "string or null",
    "projectType": "sdk | cli | webapp | api | framework | pipeline | devops | docs | monorepo | other",
    "apiSurface": [
      { "name": "string", "type": "function | class | type | command | endpoint | component", "description": "string" }
    ],
    "workflows": [
      { "name": "string", "steps": "string" }
    ],
    "concepts": ["string"],
    "integrations": ["string"],
    "configPatterns": ["string"]
  },
  "questions": [
    {
      "id": "focus",
      "question": "string",
      "options": ["string", "string", "string"],
      "multiSelect": false
    },
    {
      "id": "audience",
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "multiSelect": false
    },
    {
      "id": "architecture",
      "question": "string or null",
      "options": ["string", "string", "string"] or null,
      "multiSelect": false
    }
  ],
  "recommendedArchitecture": {
    "type": "single | hub-and-spoke",
    "files": [
      { "name": "SKILL.md", "purpose": "string" }
    ]
  }
}

No text outside the JSON. No markdown fences. No preamble.
```

---

### **4\. Skill Generation — Claude Call \#2 (`lib/generator.ts` \+ `lib/prompts.ts`)**

```ts
// lib/generator.ts
import { getVertexClient, MODEL_ID } from './vertex-client';

export async function generateSkill(analysis: object, answers: object, repoMarkdown: string) {
  const client = getVertexClient();

  const message = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 16000,
    temperature: 0.2,
    system: GENERATOR_SYSTEM_PROMPT,   // from prompts.ts
    messages: [{
      role: 'user',
      content: `## Repository Analysis\n${JSON.stringify(analysis)}\n\n## User Preferences\n${JSON.stringify(answers)}\n\n## Full Repository Source (Repomix compressed markdown)\n\n---BEGIN REPO MARKDOWN---\n${repoMarkdown}\n---END REPO MARKDOWN---\n\nGenerate the complete skill architecture.`
    }],
  });

  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  return JSON.parse(text);
}
```

**Generator system prompt** (in `lib/prompts.ts`):

```
You are an expert at creating Claude skill files — structured knowledge that makes Claude
deeply understand a specific codebase, tool, or project.

You will receive:
1. A repository analysis (what the project does, API surface, workflows)
2. The user's answers to clarifying questions (focus, audience, architecture)
3. The full repository source code as Repomix-compressed markdown

Generate a complete skill architecture that would make Claude an expert for this project.

## Skill File Specification

### SKILL.md (the hub file)

Required YAML frontmatter:
---
name: {kebab-case name}
description: >
  {A "pushy" trigger description. Include what the skill does AND trigger phrases.
  List keywords, synonyms, related concepts liberally — err on over-triggering.}
---

Body (in order):
1. 1-2 sentence overview
2. Installation/setup command(s)
3. Routing table to reference files (skip if none)
4. Quickstart: 5-minute workflow with working code
5. Core API cheatsheet: method signatures, key types
6. Common workflow patterns (numbered sequences)
7. Key types/interfaces reference (exact names from source)
8. Error handling patterns (if applicable)

SKILL.md MUST be under 500 lines. Use reference files for depth.

### Reference files (references/*.md)

Deep dives per capability domain. 200-400 lines each, containing:
1. Detailed API usage with realistic code examples
2. Configuration options with defaults
3. Common patterns and recipes
4. Edge cases and gotchas

## Critical Rules

1. CODE ACCURACY: Use exact method names, parameter names, type names, import paths
   from source. Never invent methods.
2. IMPORT PATHS: Use actual package name from package.json/Cargo.toml/pyproject.toml.
3. PROGRESSIVE DISCLOSURE: Simplest example first, build to complex.
4. WORKFLOW ORIENTATION: Show methods in real workflows, not isolated API docs.
5. TYPE ACCURACY: Exact field names and types from source.
6. TRIGGER DESCRIPTION: Aggressively inclusive keyword list.
7. AUDIENCE CALIBRATION: Match detail level to audience answer.
8. NON-SDK PROJECTS: For CLIs use usage patterns; for web apps use route/component patterns;
   for DevOps use config/deployment patterns; for frameworks use setup/extension patterns.

## Output Format

Valid JSON only:

{
  "files": [
    { "path": "SKILL.md", "content": "string" },
    { "path": "references/topic.md", "content": "string" }
  ],
  "metadata": {
    "skillName": "string",
    "totalLines": number,
    "fileCount": number,
    "estimatedTriggerPhrases": ["string"]
  }
}

No text outside the JSON. No markdown fences. No preamble.
```

---

### **5\. Frontend UI (`app/page.tsx` \+ `components/`)**

Single-page flow with 4 states, built with COSS components:

**State 1: Input**

* Headline: **"ShadowOSS"** (large, bold)  
* Subhead: "Drop a GitHub repo. Get an AI skill file. Make Claude actually understand your code."  
* COSS `Input` component for GitHub URL (placeholder: `github.com/owner/repo`)  
* COSS `Button` — "Forge Skill"  
* Brief explanation below  
* 3 clickable example repos (e.g., `pallets/flask`, `shadcn-ui/ui`, `BurntSushi/ripgrep`)

**State 2: Processing**

* COSS loading/spinner component  
* Live status updates:  
  * "Cloning repository via Repomix..."  
  * "Extracting code structure (Tree-sitter compression)..."  
  * "Packed {N} files into {tokenCount} tokens"  
  * "Claude is analyzing the codebase..."

**State 3: Questions**

* Repo analysis summary at top (COSS `Card`)  
* 2-3 questions as clickable COSS `Card` options (highlighted border on selection)  
* Recommended architecture as mini file tree  
* COSS `Button` — "Generate Skill" (enabled when all answered)

**State 4: Result**

* File tree on left (custom component, COSS styling)  
* COSS `Tabs` on right for file preview with syntax highlighting  
* Click file in tree → switch tab  
* COSS `Button` primary — "Download ZIP"  
* COSS `Button` secondary — "Copy SKILL.md"  
* "Start Over" link to reset

**Design:**

* Dark mode default (developer aesthetic, match COSS dark theme)  
* Monospace: JetBrains Mono (Google Fonts) for code previews  
* Sans-serif: Inter (or COSS default font)  
* COSS component styling throughout  
* Responsive but desktop-first

---

### **6\. API Routes**

**`app/api/analyze/route.ts`:**

```ts
import { convertRepoToMarkdown } from '@/lib/repomix';
import { analyzeRepo } from '@/lib/analyzer';

export async function POST(req: Request) {
  const { repoUrl } = await req.json();

  // 1. Validate URL (github.com/owner/repo pattern)
  // 2. Convert repo to markdown via Repomix
  const repomixResult = await convertRepoToMarkdown(repoUrl);

  // 3. Analyze with Claude via Vertex AI
  const analysis = await analyzeRepo(repomixResult.markdown);

  // 4. Return analysis + questions + markdown for step 2
  return Response.json({
    ...analysis,
    repoMarkdown: repomixResult.markdown,
    repomixMeta: {
      tokenCount: repomixResult.tokenCount,
      fileCount: repomixResult.fileCount,
    },
  });
}
```

**`app/api/generate/route.ts`:**

```ts
import { generateSkill } from '@/lib/generator';

export async function POST(req: Request) {
  const { analysis, answers, repoMarkdown } = await req.json();

  const result = await generateSkill(analysis, answers, repoMarkdown);

  return Response.json(result);
}
```

---

### **7\. ZIP Generation (`lib/zip.ts`)**

```ts
import JSZip from 'jszip';

interface SkillFile { path: string; content: string; }

export async function generateZip(skillName: string, files: SkillFile[]): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(skillName);
  for (const file of files) {
    folder.file(file.path, file.content);
  }
  return zip.generateAsync({ type: 'blob' });
}
```

---

### **8\. package.json Dependencies**

```json
{
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "@anthropic-ai/vertex-sdk": "^0.7",
    "repomix": "^0.4",
    "jszip": "^3.10",
    "react-markdown": "^9",
    "react-syntax-highlighter": "^15"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "@types/react": "^19",
    "@types/node": "^22",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "postcss": "^8"
  }
}
```

Note: COSS components are copied into the project (not installed as a dependency).

---

## **Edge Cases**

1. **Monorepos**: If Repomix output \>150K tokens, detect monorepo pattern, add pre-question "Which package?", re-run Repomix with `include` filter.

2. **Private repos**: Repomix clone fails → "This tool works with public repos only."

3. **Very large repos**: `--compress` handles most. If still too large, add `ignore` for tests/docs/examples and retry.

4. **Non-code repos**: Token count \<1000 → "Not enough source code for a useful skill."

5. **Claude JSON parse failures**: Retry once with "Respond ONLY with valid JSON."

6. **Repomix timeout**: 45s timeout → suggest specific subdirectory URL.

7. **Vertex AI auth failures**: "GCP authentication failed. Check service account credentials."

8. **Vertex AI rate limits**: Queue, retry with backoff, show "High demand — queued."

---

## **Testing Checklist**

| Repo | Type | Verify |
| ----- | ----- | ----- |
| `anthropics/anthropic-sdk-typescript` | TS SDK | Client methods, streaming, tool use |
| `pallets/flask` | Python framework | Routes, templates, blueprints |
| `BurntSushi/ripgrep` | Rust CLI | Flags, regex, config, piping |
| `shadcn-ui/ui` | React components | Component usage, customization |
| `hashicorp/terraform` | DevOps/IaC | HCL, providers, state, modules |
| `sindresorhus/is` | Tiny utility | Single SKILL.md, no refs |
| `langchain-ai/langchainjs` | Large monorepo | Monorepo handling triggered |

---

## **Performance Targets**

* Repomix clone \+ compress: \<20 seconds  
* Claude analysis (Vertex): \<10 seconds  
* Claude generation (Vertex): \<30 seconds  
* Total URL → ZIP: \<60 seconds  
* Page load: \<2 seconds

---

## **Ship It**

1. Deploy to Vercel  
2. Set GCP env vars in Vercel dashboard  
3. Configure Namecheap DNS (A → 76.76.21.21, CNAME www → cname.vercel-dns.com)  
4. Verify at shadow-oss.info

If Repomix git clone has issues in Vercel serverless, deploy API routes to Railway/Render and keep frontend on Vercel, or use Vercel fluid compute with extended timeout.

The tweet demo (30 seconds):

1. Go to shadow-oss.info  
2. Paste a recognizable repo URL  
3. See "Repomix packing 247 files → 42K tokens"  
4. Answer 2 questions (click, click)  
5. Beautiful COSS-styled skill preview  
6. Download ZIP

No signup. No paywall. Paste and go.

