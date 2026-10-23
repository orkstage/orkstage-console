// SPDX-License-Identifier: AGPL-3.0-only
import { type NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from '@/lib/csp';

/**
 * A fresh nonce for every page request. Next.js reads it from the policy on the request and puts it
 * on the scripts it renders; the root layout reads `x-nonce` for the theme bootstrap script.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', policy);
  return response;
}

export const config = {
  // Pages only: the API rewrite, static files and images need no page policy, and prefetches are
  // not documents.
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|.*\\.(?:svg|png|ico|jpg|webp|txt|xml|webmanifest)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
