# **ShadowOSS — Architecture & Implementation Reference**

## **What It Is**

A single-page web app that takes a public GitHub repo URL, converts it to structured markdown via Repomix, streams it through Gemini 2.5 Flash Lite, and generates a complete Claude skill architecture (SKILL.md + reference files) that makes Claude deeply understand that project.

The tagline: **"Drop a GitHub repo. Give your Claude Code agents dev ~~skills~~ superpowers."**

Domain: **shadow-oss.info** (registered on Namecheap, hosted on Vercel)

## **Tech Stack**

* **Framework**: Next.js 15 (App Router, Turbopack for dev)
* **Styling**: Tailwind CSS v4 with shadcn/ui-style components (copied into `components/ui/`)
* **AI**: Gemini 2.5 Flash Lite via GCP Vertex AI (`@google-cloud/vertexai`)
* **Repo ingestion**: Repomix (used as a Node.js library)
* **Deployment**: Vercel  → custom domain 
* **Auth**: Vercel OIDC → GCP Workload Identity Federation (keyless, no service account JSON)
* **Package manager**: pnpm


---

## **GCP Vertex AI Configuration**

### **SDK Setup**

Uses `@google-cloud/vertexai` (Google's official SDK), not the Anthropic Vertex SDK.

```ts
// lib/vertex-client.ts
import { VertexAI } from "@google-cloud/vertexai";

const gemini = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT_ID!,
  location: process.env.GOOGLE_CLOUD_GEMINI_REGION ?? "us-central1",
});

const model = gemini.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: { maxOutputTokens: 65535, temperature: 0.2 },
  systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
});

const result = await model.generateContentStream({
  contents: [{ role: "user", parts: [{ text: userContent }] }],
});

for await (const chunk of result.stream) {
  const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  // process streamed text
}
```

### **Authentication: Vercel OIDC + Workload Identity Federation**

ShadowOSS uses keyless authentication — no service account JSON keys. The flow:

1. Vercel issues an OIDC JWT token for the deployment
2. Exchange OIDC token for a federated access token via GCP STS API
3. Impersonate the service account to get a GCP access token
4. Pass the access token to the VertexAI SDK via a custom auth client

```ts
// lib/vertex-auth.ts — simplified flow
const oidcToken = await getVercelOidcToken(); // from @vercel/oidc

// Step 1: OIDC → STS federated token
const stsRes = await fetch("https://sts.googleapis.com/v1/token", {
  method: "POST",
  body: JSON.stringify({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    subject_token: oidcToken,
  }),
});

// Step 2: Federated token → Service account access token
const impersonateRes = await fetch(
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
  { headers: { Authorization: `Bearer ${stsData.access_token}` } }
);
```

For local dev, falls back to Application Default Credentials (ADC) or base64-encoded service account JSON via `GOOGLE_APPLICATION_CREDENTIALS_JSON`.

### **GCP Infrastructure**

| Resource | Value |
|----------|-------|
| Project | `shadowoss` |
| WIF Pool | `vercel` |
| WIF Provider | `vercel` (OIDC, issuer `https://oidc.vercel.com/{vercel-team-slug}`) |
| Service Account | `shadowoss-vercel@shadowoss.iam.gserviceaccount.com` |
| SA Role | `roles/aiplatform.user` |
| Gemini Region | `us-central1` |

### **Environment Variables**

```
# Vercel project settings (Production + Preview)
GOOGLE_CLOUD_PROJECT_ID=shadowoss
GOOGLE_CLOUD_REGION=us-east5
GOOGLE_CLOUD_GEMINI_REGION=us-central1
GCP_PROJECT_NUMBER=103096401705
GCP_WORKLOAD_IDENTITY_POOL_ID=vercel
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel
GCP_SERVICE_ACCOUNT_EMAIL=shadowoss-vercel@shadowoss.iam.gserviceaccount.com

# Local dev only (.env.local)
GOOGLE_CLOUD_PROJECT_ID=shadowoss
GOOGLE_CLOUD_GEMINI_REGION=us-central1
# Either use ADC (gcloud auth application-default login) or:
# GOOGLE_APPLICATION_CREDENTIALS_JSON=base64-encoded-service-account-json
```

### **Model**

`gemini-2.5-flash-lite` — fast, cheap, handles large context well. `maxOutputTokens: 65535` (note: the API range is exclusive, so 65536 is rejected).

---

## **Styling**

* **Dark mode only** — developer tool aesthetic
* **Component library**: shadcn/ui-style components copied into `components/ui/` (Button, Input, Alert, Spinner)
* **Fonts**: Inter (sans-serif UI), JetBrains Mono (monospace code previews) via Google Fonts
* **Accent color**: Electric blue (`#3B82F6`)
* **Theme tokens** defined in `globals.css` using Tailwind v4 `@theme` directive
* **Responsive but desktop-first**

---

## **Domain & Deployment**

### **Vercel**

* Connected GitHub repo: `Legaci-Labs/shadow` (auto-deploys on push to `master`)


---

## **Project Structure**

```
shadowoss/
├── app/
│   ├── layout.tsx                 # Root layout, metadata, fonts, dark theme
│   ├── page.tsx                   # Main single-page app (input → processing → result)
│   ├── api/
│   │   └── quick-generate/route.ts  # SSE streaming: Repomix → Gemini → skill files
│   └── globals.css                # Tailwind v4 theme tokens + markdown styles
├── components/
│   ├── ui/                        # shadcn/ui-style primitives
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── alert.tsx
│   │   └── spinner.tsx
│   ├── RepoInput.tsx              # URL input + example repo buttons
│   ├── SkillPreview.tsx           # Markdown preview + raw view + copy/download
│   ├── FileTree.tsx               # Visual file tree sidebar
│   └── DownloadButton.tsx         # ZIP download trigger
├── lib/
│   ├── types.ts                   # Shared types: SkillFile, SkillMetadata, SkillData
│   ├── vertex-auth.ts             # Vercel OIDC → WIF → GCP access token
│   ├── vertex-client.ts           # VertexAI client factory + env validation
│   ├── repomix.ts                 # Repomix library: clone → markdown + truncation
│   ├── prompts.ts                 # QUICK_GENERATE_SYSTEM_PROMPT
│   ├── rate-limit.ts              # In-memory IP rate limiter (5 req/min)
│   └── zip.ts                     # JSZip wrapper for skill file download
├── .env.local                     # Local dev credentials (gitignored)
├── package.json
├── tsconfig.json
├── next.config.ts                 # serverExternalPackages: repomix, @google-cloud/vertexai
└── pnpm-lock.yaml
```

---

## **Application Flow**

Single-step flow with 3 UI states:

### **State 1: Input**

* Headline: **"ShadowOSS"**
* Tagline: "Drop a GitHub repo. Give your Claude Code agents dev ~~skills~~ superpowers."
* Input field (placeholder: `github.com/owner/repo`) + "Generate" button
* 3 clickable example repos: `pallets/flask`, `shadcn-ui/ui`, `BurntSushi/ripgrep`
* Accepts: full URLs, `github.com/owner/repo`, or just `owner/repo`

### **State 2: Processing (SSE streaming)**

* Left panel: spinner, status messages, character counter, progress bar, cancel button
* Right panel: live streaming output preview (2K chunk buffering for performance)
* Status progression:
  1. "Cloning repository..."
  2. "Packed {N} files into {tokenCount} tokens"
  3. "Zapping some code..."
* SSE heartbeat keepalives every 10s to prevent Vercel idle timeout
* Connection drop detection (`gotComplete` flag)

### **State 3: Result**

* File tree sidebar (left) — click to switch files
* Preview panel (right) — toggle between rendered markdown and raw text
* Syntax highlighting via `react-syntax-highlighter` with `oneDark` theme
* Actions: "Copy SKILL.md", "Download ZIP", "Start Over"
* Trigger phrases displayed as tags below the preview

---

## **API Route: `POST /api/quick-generate`**

Single SSE endpoint that handles the entire pipeline:

```
Client POST { repoUrl } →
  Rate limit check (5 req/min per IP) →
  Validate GitHub URL →
  SSE stream opens →
    event: status  { stage: "cloning", message: "Cloning repository..." }
    Repomix: clone repo → structured markdown →
    event: status  { stage: "packed", message: "Packed N files...", fileCount, tokenCount }
    event: status  { stage: "generating", message: "Zapping some code..." }
    Gemini streaming generation →
    event: chunk   { text: "...", fullLength: N }  (many of these)
    Parse JSON output (with repairTruncatedJson fallback) →
    event: complete { files: [...], metadata: {...} }
  SSE stream closes
```

**Error handling:**
- `event: error { message: "..." }` for recoverable errors
- `repairTruncatedJson()` regex-based recovery for truncated Gemini output
- Heartbeat comments (`: keepalive\n\n`) every 10s
- `maxDuration = 300` (5 minutes)

**Rate limiting:**
- In-memory sliding window: 5 requests per minute per IP
- Returns 429 with user-friendly message when exceeded
- Stale entries cleaned every 5 minutes

---

## **Repomix Integration (`lib/repomix.ts`)**

Converts a GitHub repo URL into structured markdown:

```ts
const result = await runCli(["."], process.cwd(), {
  remote: repoUrl,
  output: outputPath,
  style: "markdown",
  compress: !isVercel,    // tree-sitter WASM unavailable on Vercel serverless
  removeComments: true,
  removeEmptyLines: true,
  truncateBase64: true,
  ignore: IGNORE_PATTERNS, // tests, docs, examples, build artifacts, lock files
  quiet: true,
});
```

**Post-processing:**
- Strip base64 blobs (common in .ipynb files)
- Truncate to 120K tokens (~480K chars) with intelligent section preservation
- Keep directory tree section, truncate file contents

**Key Repomix options:**

| Option | Value | Why |
|--------|-------|-----|
| `compress` | `!isVercel` | Tree-sitter extracts structure; WASM unavailable on Vercel |
| `removeComments` | `true` | Save tokens |
| `removeEmptyLines` | `true` | Token savings without information loss |
| `ignore` | extensive pattern | Skip tests, docs, examples, build artifacts, lock files |

---

## **Generation Prompt (`lib/prompts.ts`)**

Single prompt: `QUICK_GENERATE_SYSTEM_PROMPT`. Key directives:

- Auto-detect architecture based on complexity:
  - <10 source files → Single SKILL.md
  - 3-4 capabilities → SKILL.md + 2-3 reference files
  - 5+ capabilities → Hub-and-spoke with SKILL.md + 4-6 references
- Cover ALL major capabilities (no user questions needed)
- All audience levels with progressive disclosure
- Exact method names, types, import paths from source
- Output: JSON with `files[]` array and `metadata` object
- Includes `relatedRepos` field: 3-4 adjacent repos in the ecosystem

---

## **Shared Types (`lib/types.ts`)**

```ts
export interface SkillFile {
  path: string;
  content: string;
}

export interface SkillMetadata {
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

export interface SkillData {
  files: SkillFile[];
  metadata: SkillMetadata;
}
```

---

## **Dependencies**

```json
{
  "dependencies": {
    "@google-cloud/vertexai": "^1.10.0",
    "@vercel/analytics": "^1.6.1",
    "@vercel/oidc": "^3.2.0",
    "jszip": "^3.10",
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "react-markdown": "^9",
    "react-syntax-highlighter": "^15",
    "repomix": "^1.11"
  }
}
```

UI components are copied into the project (not installed as a dependency).

---

## **Edge Cases**

1. **Large repos**: Repomix truncation at 120K tokens with intelligent section preservation
2. **Private repos**: Repomix clone fails → "Failed to process repository"
3. **Non-code repos**: Token count <1000 → "Not enough source code for a useful skill."
4. **Truncated Gemini output**: `repairTruncatedJson()` regex recovery extracts partial files
5. **Parse failures**: Strip markdown fences, try repair, show "Failed to parse skill output"
6. **Vercel idle timeout**: SSE heartbeat comments every 10s
7. **Connection dropped**: `gotComplete` flag detection → "Connection lost" error
8. **Rate limiting**: 5 req/min per IP → 429 with user-friendly message
9. **Missing env vars**: `ensureProjectId()` throws clear error at request time
10. **tree-sitter on Vercel**: WASM unavailable → `compress: false` on Vercel, full source sent

---

## **Testing Checklist**

| Repo | Type | Verify |
|------|------|--------|
| `pallets/flask` | Python framework | Routes, templates, blueprints |
| `shadcn-ui/ui` | React components | Component usage, customization |
| `BurntSushi/ripgrep` | Rust CLI | Flags, regex, config |
| `circlefin/stablecoin-evm` | Solidity (large) | Handles 104 files, completes within 300s |
| `sindresorhus/is` | Tiny utility | Single SKILL.md, no refs |

---

## **Performance Characteristics**

* Repomix clone + process: 10-30 seconds (depends on repo size)
* Gemini generation: 30-180 seconds (depends on output size)
* Total URL → result: 40-210 seconds
* SSE stream starts within seconds of generation beginning
* Page load: <2 seconds (static, pre-rendered)

---

## **Self-Hosting**

1. Clone `Legaci-Labs/shadow`
2. Copy `.env.example` to `.env.local`, fill in GCP credentials
3. Required: GCP project with Vertex AI API enabled
4. Required: `gcloud auth application-default login` (local dev)
5. Optional: GitHub personal access token for future skill graph discovery
6. `pnpm install && pnpm dev`
