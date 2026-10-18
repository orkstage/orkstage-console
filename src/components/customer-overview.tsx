// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { CustomerOverviewDto } from '@orkstage/contracts';
import { useQuery } from '@tanstack/react-query';
import { Activity, Boxes, LineChart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormat } from '@/i18n/format';
import { useStatusLabel } from '@/i18n/labels';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SimulatedBadge } from './ui/badge';
import { Card, CardHeader, StatCard } from './ui/card';
import { EmptyState } from './ui/empty-state';
import { ErrorNotice } from './ui/error-notice';
import { PageHeader } from './ui/page-header';
import { Select } from './ui/select';
import { PageSpinner } from './ui/spinner';
import { StatusBadge, StatusDot } from './ui/status-badge';

type Day = CustomerOverviewDto['instances'][number]['components'][number]['days'][number];

function barTone(uptime: number | null): string {
  if (uptime === null) return 'bg-border';
  if (uptime >= 99.9) return 'bg-ok';
  if (uptime >= 95) return 'bg-warn';
  return 'bg-danger';
}

/** Thirty bars, one per day, oldest on the left. */
function UptimeBars({ days, label }: { days: Day[]; label: string }) {
  const t = useTranslations('customerOverview');
  const fmt = useFormat();
  return (
    <div className="flex h-6 items-end gap-px" role="img" aria-label={label}>
      {days.map((d) => (
        <span
          key={d.day}
          className={cn('h-full flex-1 rounded-[1px]', barTone(d.uptime))}
          title={d.uptime === null ? t('dayNoData', { day: fmt.date(d.day) }) : t('day', { day: fmt.date(d.day), value: fmt.number(d.uptime, 2) })}
        />
      ))}
    </div>
  );
}

/**
 * The customer dashboard (spec §42, open item 11): the first screen of tenant members. Instance
 * health and deployment state, components with 30 days of uptime, open incidents and activity.
 */
export function CustomerOverview({ tenants }: { tenants: { id: string; name: string }[] }) {
  const t = useTranslations('customerOverview');
  const fmt = useFormat();
  const statusLabel = useStatusLabel();
  const [tenantId, setTenantId] = useState(tenants[0]!.id);
  const q = useQuery({
    queryKey: ['customer-overview', tenantId],
    queryFn: ({ signal }) => apiGet<CustomerOverviewDto>(`/tenants/${tenantId}/overview`, { signal }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description', { tenant: q.data?.tenant.name ?? tenants.find((x) => x.id === tenantId)?.name ?? '' })}
        actions={
          tenants.length > 1 ? (
            <Select aria-label={t('tenant')} value={tenantId} onChange={(e) => setTenantId(tenants.find((x) => x.id === e.target.value)?.id ?? tenantId)} className="w-56">
              {tenants.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          ) : null
        }
      />
      {q.isPending ? (
        <PageSpinner />
      ) : q.error ? (
        <ErrorNotice error={q.error} title={t('unavailable')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label={t('stats.instances')} value={q.data.totals.instances} />
            <StatCard label={t('stats.healthy')} value={`${q.data.totals.healthy}/${q.data.totals.instances}`} tone={q.data.totals.healthy < q.data.totals.instances ? 'warn' : 'ok'} />
            <StatCard label={t('stats.deploying')} value={q.data.totals.deploying} />
            <StatCard label={t('stats.openIncidents')} value={q.data.totals.openIncidents} tone={q.data.totals.openIncidents > 0 ? 'danger' : undefined} />
            <StatCard label={t('stats.cost')} value={fmt.money(q.data.totals.estimatedMonthlyCost)} />
          </div>

          {q.data.instances.length === 0 ? (
            <Card>
              <EmptyState icon={Boxes} title={t('noInstancesTitle')} description={t('noInstancesBody')} />
            </Card>
          ) : (
            <section className="space-y-3" aria-label={t('stats.instances')}>
              {q.data.instances.map((i) => (
                <Card key={i.id}>
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                    <Link href={`/instances/${i.id}`} className="font-semibold hover:underline">
                      {i.name}
                    </Link>
                    <StatusBadge status={i.status} />
                    {i.simulated ? <SimulatedBadge /> : null}
                    <span className="text-xs text-fg-subtle">{i.environment}</span>
                    <span className="ml-auto text-xs text-fg-subtle">
                      {i.lastDeployment ? t('lastDeployment', { status: statusLabel(i.lastDeployment.status).toLowerCase(), time: fmt.relative(i.lastDeployment.at) }) : t('neverDeployed')}
                      {i.estimatedMonthlyCost !== null ? ` · ${t('costPerMonth', { amount: fmt.money(i.estimatedMonthlyCost) })}` : ''}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="mb-2 text-sm font-medium">{i.uptime30d === null ? t('noUptime') : t('uptime', { value: fmt.number(i.uptime30d, 2) })}</p>
                    {i.components.length > 0 ? (
                      <ul className="space-y-2">
                        {i.components.map((c) => (
                          <li key={c.name} className="grid items-center gap-2 sm:grid-cols-[12rem_1fr_6rem]">
                            <span className="flex items-center gap-2 text-sm">
                              <StatusDot status={c.status} />
                              {c.name}
                            </span>
                            <UptimeBars days={c.days} label={c.uptime30d === null ? t('noUptime') : t('uptime', { value: fmt.number(c.uptime30d, 2) })} />
                            <span className="text-right text-xs text-fg-subtle">{c.uptime30d === null ? fmt.empty : `${fmt.number(c.uptime30d, 2)}%`}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-3 flex gap-4 text-xs">
                      <Link href={`/instances/${encodeURIComponent(i.id)}?tab=metrics`} className="inline-flex items-center gap-1 text-accent-ink hover:underline">
                        <LineChart size={12} aria-hidden /> {t('metrics')}
                      </Link>
                      <Link href={`/status/${encodeURIComponent(tenantId)}`} className="inline-flex items-center gap-1 text-accent-ink hover:underline">
                        <Activity size={12} aria-hidden /> {t('statusPage')}
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
              <p className="text-xs text-fg-subtle">{t('uptimeLegend')}</p>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title={t('openIncidents')} as="h2" />
              {q.data.openIncidents.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-fg-subtle">{t('noIncidents')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {q.data.openIncidents.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <Link href={`/incidents/${i.id}`} className="text-sm font-medium hover:underline">
                        {i.title}
                      </Link>
                      <StatusBadge status={i.status} />
                      <span className="text-xs text-fg-subtle">{fmt.relative(i.openedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title={t('activity')} as="h2" />
              {q.data.recentActivity.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-fg-subtle">{t('noActivity')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {q.data.recentActivity.map((a, n) => (
                    <li key={`${a.at}-${n}`} className="flex gap-3 px-4 py-2 text-sm">
                      <time dateTime={a.at} className="w-20 shrink-0 text-xs text-fg-subtle" title={fmt.dateTime(a.at)}>
                        {fmt.relative(a.at)}
                      </time>
                      <Link href={a.link} className="min-w-0 flex-1 hover:underline">
                        {a.message}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
