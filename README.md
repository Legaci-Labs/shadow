# ShadowOSS

Drop a GitHub repo. Give your Claude Code agents dev ~~skills~~ superpowers.

**[shadow-oss.info](https://shadow-oss.info)**

ShadowOSS converts any public GitHub repository into a structured Claude skill file (SKILL.md + reference files). Paste a repo URL, get a skill your Claude Code agents can use immediately.

## How It Works

```
GitHub repo URL
    |
    v
Repomix (clone + extract structured markdown)
    |
    v
Gemini 2.5 Flash Lite (generate skill architecture)
    |
    v
SKILL.md + references/*.md (download as ZIP)
```

1. **Paste** a public GitHub repo URL (or just `owner/repo`)
2. **Wait** — Repomix clones and packs the repo, Gemini generates the skill via SSE streaming
3. **Preview** the generated SKILL.md with rendered markdown and syntax highlighting
4. **Download** as a ZIP or copy SKILL.md to clipboard

## Tech Stack

- **Next.js 15** (App Router) + **React 19** + **Tailwind CSS v4**
- **Gemini 2.5 Flash Lite** via GCP Vertex AI
- **Repomix** for repo-to-markdown conversion
- **Vercel** for hosting (SSE streaming, 300s function timeout)
- **Vercel OIDC + GCP Workload Identity Federation** for keyless auth in production

## Self-Hosting

### Prerequisites

- Node.js 18+
- pnpm
- A GCP project with the **Vertex AI API** enabled

### Setup

```bash
git clone https://github.com/Legaci-Labs/shadow.git
cd shadow
pnpm install
cp .env.example .env.local
```

Edit `.env.local` with your GCP project details:

```env
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
GOOGLE_CLOUD_GEMINI_REGION=us-central1
```

For local development, authenticate with GCP Application Default Credentials:

```bash
gcloud auth application-default login
```

Or use a service account key (base64-encoded):

```env
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64-encoded-service-account-json>
```

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy to Vercel

The recommended production auth method is **Vercel OIDC + GCP Workload Identity Federation** (keyless, no service account JSON). See the [architecture doc](Build%20%20ShadowOSS%E2%80%94%20Generate%20Claude%20Skills%20from%20Any%20GitHub%20Repo.md) for full WIF setup.

Required Vercel environment variables:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project ID |
| `GOOGLE_CLOUD_GEMINI_REGION` | Gemini region (e.g. `us-central1`) |
| `GCP_PROJECT_NUMBER` | GCP project number |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | WIF pool ID |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | WIF provider ID |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Service account with `roles/aiplatform.user` |

## Project Structure

```
app/
  page.tsx                        # Single-page app (input -> processing -> result)
  api/quick-generate/route.ts     # SSE endpoint: Repomix -> Gemini -> skill files
components/
  RepoInput.tsx                   # URL input + example repo buttons
  SkillPreview.tsx                # Markdown preview + raw view
  FileTree.tsx                    # File tree sidebar
  DownloadButton.tsx              # ZIP download
  ui/                             # shadcn/ui-style primitives
lib/
  types.ts                        # Shared types (SkillFile, SkillMetadata, SkillData)
  vertex-client.ts                # Gemini client factory
  vertex-auth.ts                  # Vercel OIDC -> WIF -> GCP access token
  repomix.ts                      # Repo -> structured markdown
  prompts.ts                      # Generation system prompt
  rate-limit.ts                   # In-memory IP rate limiter (5 req/min)
  zip.ts                          # JSZip wrapper
```

## Architecture

See the full [architecture doc](Build%20%20ShadowOSS%E2%80%94%20Generate%20Claude%20Skills%20from%20Any%20GitHub%20Repo.md) for system diagrams, auth flow, SSE protocol, and implementation details.

## License

MIT
