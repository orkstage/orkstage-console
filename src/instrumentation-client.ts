// SPDX-License-Identifier: AGPL-3.0-only
// Runs before the application's code in the browser (Next.js client instrumentation): the Zod
// setting must apply before any schema module loads, see src/lib/zod-config.ts.
import '@/lib/zod-config';
