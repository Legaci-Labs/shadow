# Skill Graph Feature — Implementation Plan

## Context

ShadowOSS currently generates a single Claude skill file from a GitHub repo. This plan adds **Skill Graph** — for every repo entered, discover 3-4 adjacent repos that form complementary skills, then generate a connecting index. Together these create a "skill graph" that gives an agent deep, interconnected context across an ecosystem (e.g., Flask + SQLAlchemy + Alembic + Celery).

**Deployment model**: Hosted demo runs on your API keys. Devs are encouraged to fork/clone the repo and bring their own GCP Vertex AI keys + optional GitHub token. The repo README will document self-hosting clearly.

---

## Phase 1: Extract Shared SSE Helpers (refactor)

The SSE streaming logic (`sendEvent`, `streamGenerate`, `streamGenerateGemini`, `repairTruncatedJson`) is currently duplicated across `app/api/generate/route.ts` and `app/api/quick-generate/route.ts`. Extract into a shared module before adding a third route.

**Create**: `lib/sse-stream.ts`
- Export `sendEvent()`, `streamGenerate()`, `streamGenerateGemini()`, `repairTruncatedJson()`

**Modify**: `app/api/generate/route.ts`, `app/api/quick-generate/route.ts`
- Import from `lib/sse-stream.ts` instead of local definitions

---

## Phase 2: Dependency Parser

Parse manifest files (package.json, Cargo.toml, pyproject.toml, go.mod) from the Repomix markdown string — no additional I/O needed since these files are already embedded in the markdown.

**Create**: `lib/dependency-parser.ts`

```typescript
export interface ParsedDependencies {
  language: "javascript" | "typescript" | "python" | "rust" | "go" | "unknown";
  dependencies: Array<{ name: string; version: string; isDev: boolean }>;
}

export function parseDependencies(repoMarkdown: string): ParsedDependencies;
```

Strategy: regex for file content sections by filename pattern, then parse JSON (package.json) or TOML-like sections (Cargo.toml, pyproject.toml) or line-by-line (go.mod, requirements.txt).

---

## Phase 3: GitHub Discovery

Find 3-4 adjacent repos via the GitHub REST API using two strategies:

**Create**: `lib/github-discovery.ts`

```typescript
export interface DiscoveredRepo {
  fullName: string;        // "owner/repo"
  url: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  relationship: string;    // "dependency", "same-ecosystem", "similar-tool"
  relevanceScore: number;  // 0-1
  connectionPoints: string[];
}

export async function discoverAdjacentRepos(
  repoUrl: string,
  dependencies: ParsedDependencies,
  analysisHints?: { integrations: string[]; concepts: string[] }
): Promise<DiscoveredRepo[]>;
```

**Discovery strategies** (in priority order):
1. **Dependency-based**: For top 5 non-dev dependencies, search GitHub for the dependency's own repo (exact match) + major consumers. Score highest.
2. **Topic-based**: Get source repo topics via `GET /repos/{owner}/{repo}/topics`, then search `topic:{topic}+stars:>100`. Deduplicate against dependency results.
3. **Keyword fallback**: If <3 candidates, use Claude's `integrations` and `concepts` fields from analysis to search by keyword.

**GitHub auth**: Optional `GITHUB_TOKEN` env var for higher rate limits (5000/hr vs 10 searches/min unauthenticated). Graceful degradation if rate-limited — return whatever candidates found so far.

---

## Phase 4: Backend Routes

### `POST /api/discover`
- **Input**: `{ repoUrl, repoMarkdown?, analysis? }`
- **Output**: `{ candidates: DiscoveredRepo[] }` (JSON, not SSE — fast, 2-5 sec)
- Parses dependencies from markdown, calls `discoverAdjacentRepos()`
- Called by frontend after primary skill completes

### `POST /api/generate-adjacent`
- **Input**: `{ repoUrl, relationship, connectionPoints }`
- **Output**: SSE stream (same events as quick-generate)
- Reuses shared SSE helpers from `lib/sse-stream.ts`
- Same Repomix → Claude/Gemini pipeline as quick-generate
- Adds relationship context to the prompt so the skill is graph-aware

### `POST /api/skill-graph-index`
- **Input**: `{ primarySkill, adjacentSkills[] }` (metadata only, not full markdown)
- **Output**: `{ path: "SKILL-GRAPH.md", content: string }` (JSON, not SSE — small/fast)
- Uses a new `SKILL_GRAPH_INDEX_PROMPT` added to `lib/prompts.ts`
- Auto-triggered once 2+ adjacent skills are generated

---

## Phase 5: Skill Graph Index Prompt

**Add to**: `lib/prompts.ts`

New `SKILL_GRAPH_INDEX_PROMPT` (~50 lines) that takes skill metadata from primary + adjacents and generates a `SKILL-GRAPH.md` containing:
- Skills table with relationships and connection points
- 2-3 cross-skill workflows (the most valuable part — realistic dev tasks showing which skills are needed and in what order)
- Under 200 lines, focused on workflows

---

## Phase 6: Frontend Components

### `components/SkillGraphPanel.tsx`
Container rendered below `SkillPreview` in the result state. Manages:
- Discovery state: fires `/api/discover` on mount
- Card state per-candidate: `discovering` → `discovered` → `generating` → `ready`
- "Generate All" button fires parallel `/api/generate-adjacent` calls
- Auto-generates graph index once 2+ adjacent skills complete

### `components/SkillGraphCard.tsx`
Individual card showing: repo name (linked), stars, description, relationship tag, connection point badges, and action button (Generate / Generating... / View Skill).

### Modify `app/page.tsx`
- New state: `discoveredRepos: DiscoveredRepo[]`, `adjacentSkills: Record<string, SkillData>`, `graphIndex: {path, content} | null`
- After primary `complete` event → auto-fire `/api/discover`
- Render `SkillGraphPanel` below `SkillPreview` in the result view
- No changes to the `AppState` type — graph is an enhancement to `result`, not a new state

### Modify `components/DownloadButton.tsx`
When graph data exists, the ZIP includes:
```
{skillName}/
  SKILL.md
  references/...
  SKILL-GRAPH.md
  adjacent/
    {adj1}/SKILL.md, references/...
    {adj2}/SKILL.md, references/...
```

---

## Phase 7: BYOK / Self-Hosting Support

### Modify `.env.example`
```
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
GOOGLE_CLOUD_REGION=global
GOOGLE_CLOUD_GEMINI_REGION=us-central1
# Optional: GitHub token for higher API rate limits during skill graph discovery
# GITHUB_TOKEN=ghp_...
```

### Add to repo README
- Self-hosting instructions (clone, configure .env.local, `pnpm dev`)
- Required: GCP project with Vertex AI + Claude enabled
- Optional: GitHub personal access token for discovery
- Cost estimates per skill generation

---

## Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | Extract shared SSE helpers | Create `lib/sse-stream.ts`, modify both route files |
| 2 | Dependency parser | Create `lib/dependency-parser.ts` |
| 3 | GitHub discovery | Create `lib/github-discovery.ts` |
| 4 | Discovery route | Create `app/api/discover/route.ts` |
| 5 | Adjacent generation route | Create `app/api/generate-adjacent/route.ts` |
| 6 | Graph index prompt + route | Modify `lib/prompts.ts`, create `lib/skill-graph.ts`, create `app/api/skill-graph-index/route.ts` |
| 7 | Frontend: cards + panel | Create `components/SkillGraphCard.tsx`, `components/SkillGraphPanel.tsx` |
| 8 | Frontend: wire into page | Modify `app/page.tsx` |
| 9 | Download with graph | Modify `components/DownloadButton.tsx` |
| 10 | BYOK docs + env | Modify `.env.example`, update README |

---

## Edge Cases

- **Rate limited**: Return partial candidates, show "add GitHub token for better results"
- **0 candidates found**: Fallback to Claude's `integrations`/`concepts` keywords, show message if still 0
- **Adjacent repo too large**: Repomix truncation handles this (120K token cap)
- **No manifest file**: Discovery falls back to topic + keyword strategies only
- **User navigates away**: AbortController cleanup on all fetches
- **Graph index fails**: Non-critical — individual skills still usable, offer retry

---

## Verification

1. Enter a well-known repo (e.g., `pallets/flask`) → primary skill generates as before
2. After result, SkillGraphPanel appears with 3-4 discovered repos (e.g., SQLAlchemy, Jinja2, Click)
3. Click "Generate" on one → SSE streams adjacent skill
4. Click "Generate All" → parallel generation
5. After 2+ complete → SKILL-GRAPH.md auto-generates
6. Download ZIP includes full graph structure
7. Test with a repo that has no manifest → discovery degrades to topics only
8. Test with `GITHUB_TOKEN` unset → still works, lower rate limit
