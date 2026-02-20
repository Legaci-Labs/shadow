import { isVercelOidc, getWifAccessToken, ensureVertexCredentials } from "./vertex-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _localGemini: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGeminiClient(): Promise<any> {
  const { VertexAI } = await import("@google-cloud/vertexai");
  if (isVercelOidc()) {
    const accessToken = await getWifAccessToken();
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

export const GEMINI_MODEL_ID = "gemini-2.5-flash-lite";
