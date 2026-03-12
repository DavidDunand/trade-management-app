import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from bundling pdfkit so it can resolve its own font files at runtime
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
