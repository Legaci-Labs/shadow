import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import { VertexAI } from "@google-cloud/vertexai";
import { isVercelOidc, createWifAuthClient, ensureVertexCredentials } from "./vertex-auth";

// Cached clients for local dev (ADC). Not used on Vercel (per-request auth).
let _localClient: AnthropicVertex | null = null;
let _localGemini: VertexAI | null = null;

export async function getVertexClient(): Promise<AnthropicVertex> {
  if (isVercelOidc()) {
    const authClient = await createWifAuthClient();
    return new AnthropicVertex({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      region: process.env.GOOGLE_CLOUD_REGION ?? "global",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authClient: authClient as any,
    });
  }

  if (!_localClient) {
    ensureVertexCredentials();
    _localClient = new AnthropicVertex({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      region: process.env.GOOGLE_CLOUD_REGION ?? "global",
    });
  }
  return _localClient;
}

export async function getGeminiClient(): Promise<VertexAI> {
  if (isVercelOidc()) {
    const authClient = await createWifAuthClient();
    return new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      location: process.env.GOOGLE_CLOUD_GEMINI_REGION ?? "us-central1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      googleAuthOptions: { authClient: authClient as any },
    });
  }

  if (!_localGemini) {
    ensureVertexCredentials();
    _localGemini = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      location: process.env.GOOGLE_CLOUD_GEMINI_REGION ?? "us-central1",
    });
  }
  return _localGemini;
}

export const MODEL_ID = "claude-sonnet-4-6";
export const FALLBACK_MODEL_ID = "gemini-2.5-flash-lite";
export const MODEL_TIMEOUT_MS = 30_000;
