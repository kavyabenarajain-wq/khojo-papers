import type { NextConfig } from "next";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";

// Baseline CSP. Scripts are same-origin; 'unsafe-inline' is needed for Next's inline bootstrap
// scripts and KaTeX's inline styles (a nonce-based policy is a possible hardening step).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Every page reads the session or the database at request time, so the app uses the
  // request-time rendering model rather than Cache Components.
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "unpdf", "postgres", "@napi-rs/canvas"],
  experimental: {
    // Answer photos are capped at 8 MB in the upload route; keep proxy buffering above that.
    proxyClientMaxBodySize: "9mb",
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    const headers = process.env.NODE_ENV === "production" ? [...securityHeaders, { key: "Content-Security-Policy", value: csp }] : securityHeaders;
    return [{ source: "/:path*", headers }];
  },
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
