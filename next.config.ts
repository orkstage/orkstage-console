// SPDX-License-Identifier: AGPL-3.0-only
import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this origin: `/api/*` is proxied to the control API so the
 * session cookie stays same-origin (httpOnly, SameSite=Lax) and no token touches client code.
 * API_INTERNAL_URL is the API origin (no path), e.g. http://api:4000 inside a cluster.
 */
const apiOrigin = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // One Zod in the bundle: the core packages, linked from source until they are published, would
  // otherwise bring their own copy, which ignores this app's Zod settings (src/lib/zod-config.ts).
  turbopack: { resolveAlias: { zod: './node_modules/zod' } },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        // The Content Security Policy carries a nonce per request, so src/proxy.ts sets it.
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Ignored by browsers over plain http (local development), enforced behind TLS.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
