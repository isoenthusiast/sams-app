import type { NextConfig } from "next";

const BUILD_TIME = new Date().toISOString();

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/adapter-pg", "pg"],

  // Prevent browser caching of HTML/RSC payloads between deploys.
  // Without this, users need Ctrl+Shift+R to see new deployments.
  // - no-store: browser must NOT cache (stronger than no-cache)
  // - must-revalidate: forces re-fetch even if cached at edge
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
          {
            key: "X-Build-Time",
            value: BUILD_TIME,
          },
        ],
      },
    ];
  },

  // Expose build time as a public env var so the client can detect
  // stale deployments and show a "New version available" banner
  env: {
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
};

export default nextConfig;
