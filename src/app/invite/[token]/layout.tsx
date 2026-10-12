// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';
import { pageMetadata } from '@/i18n/server';

export const generateMetadata = () => pageMetadata('invite');

export default function InviteLayout({ children }: { children: ReactNode }) {
  return children;
}
