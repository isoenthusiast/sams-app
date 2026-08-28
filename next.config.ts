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
      {
        // Content-hashed JS/CSS chunks should be cached, not no-store. The rule
        // above would otherwise force the browser to re-fetch every chunk on each
        // load, which breaks client hydration on high-latency links (e.g. Tailscale).
        // Later rules win for the same header key, so this restores immutable caching.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
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
