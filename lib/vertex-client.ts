import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import { isVercelOidc, getWifAccessToken, ensureVertexCredentials } from "./vertex-auth";

// Cached clients for local dev (ADC). Not used on Vercel (per-request auth).
let _localClient: AnthropicVertex | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _localGemini: any = null;

export async function getVertexClient(): Promise<AnthropicVertex> {
  if (isVercelOidc()) {
    const accessToken = await getWifAccessToken();
    // Must provide authClient to prevent the SDK from calling new GoogleAuth().getClient()
    // which fails on Vercel (no ADC). The accessToken takes precedence for actual API calls.
    const noopAuthClient = {
      getAccessToken: async () => ({ token: accessToken, res: null }),
      getRequestHeaders: async () => ({ Authorization: `Bearer ${accessToken}` }),
    };
    return new AnthropicVertex({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      region: process.env.GOOGLE_CLOUD_REGION ?? "global",
      accessToken,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authClient: noopAuthClient as any,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGeminiClient(): Promise<any> {
  const { VertexAI } = await import("@google-cloud/vertexai");
  if (isVercelOidc()) {
    const accessToken = await getWifAccessToken();
    // Create a minimal auth client that returns the pre-fetched WIF token
    const fakeAuthClient = {
      getAccessToken: async () => ({ token: accessToken, res: null }),
      getRequestHeaders: async () => ({ Authorization: `Bearer ${accessToken}` }),
    };
    return new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      location: process.env.GOOGLE_CLOUD_GEMINI_REGION ?? "us-central1",
      googleAuthOptions: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authClient: fakeAuthClient as any,
      },
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
// On Vercel, the function has a 120s max duration — no need for a short timeout.
// Locally, use 60s timeout with Gemini fallback.
export const MODEL_TIMEOUT_MS = process.env.VERCEL ? 0 : 60_000;
