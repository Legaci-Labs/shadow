import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Returns true if running on Vercel with OIDC available.
 */
export function isVercelOidc(): boolean {
  return !!(
    process.env.GCP_PROJECT_NUMBER &&
    process.env.GCP_WORKLOAD_IDENTITY_POOL_ID &&
    process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID &&
    process.env.GCP_SERVICE_ACCOUNT_EMAIL
  );
}

/**
 * Creates a GCP auth client using Vercel's OIDC token + Workload Identity Federation.
 * Must be called per-request (the OIDC token comes from the request header).
 */
export async function createWifAuthClient() {
  const { getVercelOidcToken } = await import("@vercel/oidc");
  const { ExternalAccountClient } = await import("google-auth-library");

  return ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: async () => getVercelOidcToken(),
    },
  });
}

/**
 * For local dev / service account JSON: write credentials to temp file.
 */
export function ensureVertexCredentials(): void {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!credentialsJson) return; // Assume ADC is already configured

  const credPath = join(tmpdir(), "vertex-credentials.json");
  if (!existsSync(credPath)) {
    writeFileSync(
      credPath,
      Buffer.from(credentialsJson, "base64").toString("utf-8")
    );
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
}
