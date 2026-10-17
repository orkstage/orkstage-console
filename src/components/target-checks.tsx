// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { CloudTargetDto } from '@orkstage/contracts';
import { useTranslations } from 'use-intl';
import { StatusBadge } from '@/components/ui/status-badge';
import { useFormat } from '@/i18n/format';
import { useStatusLabel } from '@/i18n/labels';

export type Validation = NonNullable<CloudTargetDto['lastValidation']>;

/** The checks of one target validation, as the adapter reported them. */
export function ChecksList({ validation }: { validation: Validation }) {
  const t = useTranslations('cloudTargets');
  const fmt = useFormat();
  const statusLabel = useStatusLabel();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={validation.ok ? 'PASS' : 'FAIL'} label={validation.ok ? t('allPassed') : t('validationFailed')} />
        <span className="text-xs text-fg-subtle">{fmt.dateTime(validation.validatedAt)}</span>
        {validation.identity ? <code className="font-mono text-xs text-fg-muted">{validation.identity}</code> : null}
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {validation.checks.map((c, i) => (
          <li key={`${c.name}-${i}`} className="flex items-start gap-2 px-3 py-2">
            <StatusBadge status={c.status} label={statusLabel(c.status)} className="mt-0.5 min-w-16 justify-center" />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-fg-muted">{c.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
