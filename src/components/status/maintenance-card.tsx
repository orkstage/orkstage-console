// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { MaintenanceDto } from '@orkstage/contracts';
import { Wrench } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { useFormat } from '@/i18n/format';
import { cn } from '@/lib/utils';

/** A running or upcoming maintenance window, on the members' and the public status page. */
export function MaintenanceCard({ m }: { m: Pick<MaintenanceDto, 'title' | 'message' | 'componentNames' | 'startsAt' | 'endsAt' | 'state'> & { instanceName?: string | null } }) {
  const t = useTranslations('statusPage');
  const fmt = useFormat();
  return (
    <article className={cn('rounded-lg border bg-surface p-4 shadow-card', m.state === 'in_progress' ? 'border-info/40' : 'border-border')}>
      <div className="flex flex-wrap items-center gap-2">
        <Wrench size={14} className="text-info-ink" aria-hidden />
        <h3 className="font-semibold">{m.title}</h3>
        <Badge tone={m.state === 'in_progress' ? 'info' : 'neutral'}>{t(`states.${m.state}`)}</Badge>
      </div>
      <p className="mt-1 text-xs text-fg-subtle">
        {t('maintenanceWhen', { start: fmt.dateTime(m.startsAt), end: fmt.dateTime(m.endsAt) })}
        {' · '}
        {[m.instanceName, m.componentNames.length > 0 ? m.componentNames.join(', ') : t('allComponents')].filter(Boolean).join(' · ')}
      </p>
      {m.message ? <p className="mt-2 text-sm">{m.message}</p> : null}
    </article>
  );
}
