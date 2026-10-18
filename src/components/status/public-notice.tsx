// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react';

/** The small centered card of the confirm and unsubscribe pages. */
export function PublicNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-10 w-full max-w-md space-y-4 rounded-lg border border-border bg-surface p-6">
      <h1 className="font-display text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
