import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["repomix", "@google-cloud/vertexai"],
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
