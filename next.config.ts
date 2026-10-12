// SPDX-License-Identifier: AGPL-3.0-only
import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this origin: `/api/*` is proxied to the control API so the
 * session cookie stays same-origin (httpOnly, SameSite=Lax) and no token touches client code.
 * API_INTERNAL_URL is the API origin (no path), e.g. http://api:4000 inside a cluster.
 */
const apiOrigin = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

/**
 * Content Security Policy. Everything loads from this origin; the console never calls another
 * host from the browser. Inline scripts stay allowed for Next.js hydration and the theme bootstrap
 * (a nonce based policy is the next step); `eval` is allowed only by the development server.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: csp },
          // Ignored by browsers over plain http (local development), enforced behind TLS.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
