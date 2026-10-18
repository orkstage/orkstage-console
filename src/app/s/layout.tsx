// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { pageMetadata } from '@/i18n/server';

/** Public status pages: no sign in, no console navigation. */
export const generateMetadata = () => pageMetadata('publicStatus');

export default function PublicStatusLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-screen px-4 py-10">{children}</main>;
}
