import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["repomix", "@anthropic-ai/vertex-sdk", "@anthropic-ai/sdk"],
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
