import AnthropicVertex from "@anthropic-ai/vertex-sdk";
import { ensureVertexCredentials } from "./vertex-auth";

let _client: AnthropicVertex | null = null;

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

export const MODEL_ID = "claude-sonnet-4-6";
