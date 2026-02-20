import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import { VertexAI } from "@google-cloud/vertexai";
import { ensureVertexCredentials } from "./vertex-auth";

let _client: AnthropicVertex | null = null;
let _geminiClient: VertexAI | null = null;

export function getVertexClient(): AnthropicVertex {
  if (!_client) {
    ensureVertexCredentials();
    _client = new AnthropicVertex({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      region: process.env.GOOGLE_CLOUD_REGION ?? "global",
    });
  }
  return _client;
}

export function getGeminiClient(): VertexAI {
  if (!_geminiClient) {
    ensureVertexCredentials();
    _geminiClient = new VertexAI({
      project: process.env.GOOGLE_CLOUD_PROJECT_ID!,
      location: process.env.GOOGLE_CLOUD_GEMINI_REGION ?? "us-central1",
    });
  }
  return _geminiClient;
}

export const MODEL_ID = "claude-sonnet-4-6";
export const FALLBACK_MODEL_ID = "gemini-2.5-flash-lite-preview-09-2025";
export const MODEL_TIMEOUT_MS = 30_000;
