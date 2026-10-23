// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

/**
 * Zod compiles object parsers with `new Function` when eval is allowed, and probes for it first.
 * The Content Security Policy forbids eval (src/lib/csp.ts), so the probe would report a violation
 * on every page with a form; parse without the compiled fast path instead. Zod decides when a
 * schema is created, so src/instrumentation-client.ts imports this before any schema module loads.
 */
z.config({ jitless: true });
