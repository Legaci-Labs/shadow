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
 * Gets a GCP access token via Vercel OIDC + Workload Identity Federation.
 * Exchanges the Vercel OIDC JWT for a GCP access token using the STS API.
 */
export async function getWifAccessToken(): Promise<string> {
  const { getVercelOidcToken } = await import("@vercel/oidc");

  const oidcToken = await getVercelOidcToken();
  const audience = `//iam.googleapis.com/projects/${process.env.GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${process.env.GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID}`;

  // Step 1: Exchange OIDC token for a federated access token via STS
  const stsRes = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      subject_token: oidcToken,
    }),
  });

  if (!stsRes.ok) {
    const err = await stsRes.text();
    throw new Error(`STS token exchange failed: ${err}`);
  }

  const stsData = await stsRes.json();

  // Step 2: Impersonate the service account to get a GCP access token
  const impersonateRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${process.env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stsData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: ["https://www.googleapis.com/auth/cloud-platform"],
      }),
    }
  );

  if (!impersonateRes.ok) {
    const err = await impersonateRes.text();
    throw new Error(`Service account impersonation failed: ${err}`);
  }

  const impersonateData = await impersonateRes.json();
  return impersonateData.accessToken;
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
