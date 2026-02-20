import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

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
