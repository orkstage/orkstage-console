// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { pageMetadata } from '@/i18n/server';

/** Localized page title (the page itself is a client component). */
export const generateMetadata = () => pageMetadata('policies');

export default function PoliciesLayout({ children }: { children: ReactNode }) {
  return children;
}
