// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Content Security Policy of the console pages (open item 24). Everything loads from this origin;
 * the console never calls another host from the browser. Scripts run only with the per request
 * nonce (Next.js puts it on its own scripts, the layout on the theme bootstrap), and scripts they
 * load inherit trust through 'strict-dynamic'. Styles keep 'unsafe-inline': React style attributes
 * cannot carry a nonce. `eval` is allowed only by the development server.
 */
export function contentSecurityPolicy(nonce: string, development = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
