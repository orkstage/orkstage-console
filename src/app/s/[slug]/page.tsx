// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { PublicStatusDto } from '@orkstage/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HelpCircle, Mail, OctagonAlert, Wrench, type LucideIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Logo } from '@/components/brand/logo';
import { MaintenanceCard } from '@/components/status/maintenance-card';
import { PublicNotice } from '@/components/status/public-notice';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { Field, Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/spinner';
import { StatusBadge, StatusDot } from '@/components/ui/status-badge';
import { useFormat } from '@/i18n/format';
import { useStatusLabel } from '@/i18n/labels';
import { apiGet, apiSend, isApiError } from '@/lib/api';
import { toneOf, type Tone } from '@/lib/status';
import { cn, durationBetween } from '@/lib/utils';

const BANNER: Record<Tone, { icon: LucideIcon; box: string; icon_: string }> = {
  ok: { icon: CheckCircle2, box: 'border-ok/40 bg-ok/8', icon_: 'text-ok-ink' },
  warn: { icon: AlertTriangle, box: 'border-warn/45 bg-warn/10', icon_: 'text-warn-ink' },
  danger: { icon: OctagonAlert, box: 'border-danger/45 bg-danger/8', icon_: 'text-danger-ink' },
  info: { icon: Wrench, box: 'border-info/40 bg-info/8', icon_: 'text-info-ink' },
  neutral: { icon: HelpCircle, box: 'border-border bg-surface', icon_: 'text-fg-subtle' },
  accent: { icon: HelpCircle, box: 'border-border bg-surface', icon_: 'text-fg-subtle' },
};

const HEADLINES = ['OPERATIONAL', 'DEGRADED', 'PARTIAL_OUTAGE', 'MAJOR_OUTAGE', 'MAINTENANCE', 'UNKNOWN'] as const;

/**
 * The public status page of a tenant (open item 8), at `/s/<slug>`: no sign in, component names
 * and states, incidents in plain words, maintenance, and an email subscription.
 */
export default function PublicStatusPage() {
  const t = useTranslations('publicStatus');
  const ts = useTranslations('statusPage');
  const fmt = useFormat();
  const statusLabel = useStatusLabel();
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery({
    queryKey: ['public-status', slug],
    queryFn: ({ signal }) => apiGet<PublicStatusDto>(`/public/status/${encodeURIComponent(slug)}`, { signal }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: (count, err) => !isApiError(err, 404) && count < 2,
  });

  if (q.isPending) return <PageSpinner />;
  if (q.error) {
    return isApiError(q.error, 404) ? (
      <PublicNotice title={ts('unavailable')}>
        <p className="text-sm">{t('notFound')}</p>
      </PublicNotice>
    ) : (
      <ErrorNotice error={q.error} className="mx-auto max-w-3xl" />
    );
  }
  const s = q.data;
  const banner = BANNER[toneOf(s.overall)];
  const Icon = banner.icon;
  const headline = (HEADLINES as readonly string[]).includes(s.overall) ? (s.overall as (typeof HEADLINES)[number]) : 'UNKNOWN';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{s.title}</h1>
        {s.description ? <p className="mt-1 text-sm text-fg-muted">{s.description}</p> : null}
      </header>

      <section aria-live="polite" className={cn('flex items-center gap-4 rounded-lg border px-5 py-5', banner.box)}>
        <Icon size={32} className={cn('shrink-0', banner.icon_)} aria-hidden />
        <div>
          <h2 className="text-lg font-semibold">{ts(`headline.${headline}`)}</h2>
          <p className="text-xs text-fg-subtle">{ts('updated', { time: fmt.time(new Date(q.dataUpdatedAt).toISOString()) })}</p>
        </div>
      </section>

      {s.openIncidents.length > 0 ? (
        <section aria-labelledby="pub-active" className="space-y-3">
          <h2 id="pub-active" className="text-sm font-semibold">
            {t('active')}
          </h2>
          {s.openIncidents.map((i) => (
            <article key={i.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{i.title}</h3>
                <StatusBadge status={i.status} />
                <span className="text-xs text-fg-subtle">{ts('since', { date: fmt.dateTime(i.openedAt) })}</span>
              </div>
              <ol className="mt-2 space-y-1">
                {i.updates.map((u, n) => (
                  <li key={`${u.at}-${n}`} className="text-sm">
                    <strong className="font-medium">{statusLabel(u.status)}:</strong> {u.message}
                    <span className="ml-1 text-xs text-fg-subtle">({fmt.relative(u.at)})</span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>
      ) : null}

      {s.maintenance.length > 0 ? (
        <section aria-labelledby="pub-maintenance" className="space-y-3">
          <h2 id="pub-maintenance" className="text-sm font-semibold">
            {t('maintenance')}
          </h2>
          {s.maintenance.map((m, n) => (
            <MaintenanceCard key={`${m.startsAt}-${n}`} m={m} />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="pub-components" className="space-y-3">
        <h2 id="pub-components" className="text-sm font-semibold">
          {t('components')}
        </h2>
        {s.groups.map((g) => (
          <Card key={g.name}>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 className="flex items-center gap-2 font-medium">
                <StatusDot status={g.status} className="h-2.5 w-2.5" />
                {g.name}
              </h3>
              <span className="text-sm">{statusLabel(g.status)}</span>
            </div>
            <ul className="divide-y divide-border">
              {g.components.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <StatusDot status={c.status} />
                    {c.name}
                  </span>
                  <span className="text-xs">{statusLabel(c.status)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader title={t('past')} as="h2" />
        {s.recentIncidents.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-fg-subtle">{t('noPast')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {s.recentIncidents.map((i) => (
              <li key={i.id} className="px-4 py-2.5">
                <p className="text-sm font-medium">{i.title}</p>
                <p className="text-xs text-fg-subtle">
                  {fmt.dateTime(i.openedAt)}
                  {i.resolvedAt ? ` · ${ts('resolvedAfter', { duration: fmt.duration(durationBetween(i.openedAt, i.resolvedAt)) })}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SubscribeCard slug={slug} />

      <footer className="flex items-center justify-center gap-2 pt-2 text-xs text-fg-subtle">
        <Logo size="sm" variant="mark" />
        {t('poweredBy')}
      </footer>
    </div>
  );
}

function SubscribeCard({ slug }: { slug: string }) {
  const t = useTranslations('publicStatus');
  const [email, setEmail] = useState('');
  const subscribe = useMutation({ mutationFn: () => apiSend('POST', `/public/status/${encodeURIComponent(slug)}/subscriptions`, { email: email.trim() }) });
  return (
    <Card>
      <CardHeader title={t('subscribeTitle')} description={t('subscribeBody')} as="h2" />
      <div className="px-4 pb-4">
        {subscribe.isSuccess ? (
          <Notice tone="ok">{t('subscribeSent')}</Notice>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              subscribe.mutate();
            }}
          >
            <Field label={t('email')} htmlFor="pub-email" className="min-w-60 flex-1">
              <Input id="pub-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" loading={subscribe.isPending}>
              <Mail size={14} aria-hidden /> {t('subscribe')}
            </Button>
          </form>
        )}
        {subscribe.error ? <ErrorNotice error={subscribe.error} className="mt-2" /> : null}
      </div>
    </Card>
  );
}
