// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { BookOpen, Check } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { docsUrl, useSetupSteps, type SetupPhase, type SetupStep } from '@/components/getting-started';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { PageHeader } from '@/components/ui/page-header';
import { PageSpinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

const PHASES: SetupPhase[] = ['connect', 'customers', 'deliver', 'operate'];

/**
 * Getting started: the guided setup from an empty installation to a running, watched instance.
 * Each step explains why it matters, links to the page that does it and to the docs, and turns
 * green from live data, so the guide stays useful after the first visit too.
 */
export default function GettingStartedPage() {
  const t = useTranslations('gettingStarted');
  const { steps, loading, staff } = useSetupSteps();
  if (loading) return <PageSpinner />;

  const tracked = steps.filter((s) => !s.optional);
  const doneCount = tracked.filter((s) => s.done).length;
  const next = tracked.find((s) => !s.done)?.key;
  const pct = tracked.length ? Math.round((doneCount / tracked.length) * 100) : 100;

  return (
    <>
      <PageHeader title={t('title')} description={staff ? t('staffDescription') : t('memberDescription')} />

      <Card className="mb-6 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">{next ? t('progress', { done: doneCount, total: tracked.length }) : t('allDone')}</span>
          <span className="text-xs text-fg-subtle">{t('optionalHint')}</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t('progressLabel')}
        >
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <div className="space-y-8">
        {PHASES.map((phase) => {
          const inPhase = steps.filter((s) => s.phase === phase);
          if (!inPhase.length) return null;
          return (
            <section key={phase} aria-labelledby={`phase-${phase}`}>
              <h2 id={`phase-${phase}`} className="font-display text-base font-semibold">
                {t(`phases.${phase}.title`)}
              </h2>
              <p className="mb-3 text-sm text-fg-muted">{t(`phases.${phase}.body`)}</p>
              <ol className="space-y-3">
                {inPhase.map((s) => (
                  <StepCard key={s.key} step={s} number={steps.indexOf(s) + 1} isNext={s.key === next} />
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}

function StepCard({ step, number, isNext }: { step: SetupStep; number: number; isNext: boolean }) {
  const t = useTranslations('gettingStarted');
  const k = step.key;
  return (
    <li>
      <Card className={cn('flex gap-4 px-4 py-4', isNext && 'ring-1 ring-accent/40')}>
        <span
          className={cn(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            step.done ? 'bg-accent text-accent-fg' : 'border border-control text-fg-muted',
          )}
          aria-hidden
        >
          {step.done ? <Check size={13} strokeWidth={3} /> : number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{t(`steps.${k}.title`)}</h3>
            {step.done ? <Badge tone="ok">{t('badges.done')}</Badge> : null}
            {isNext ? <Badge tone="accent">{t('badges.next')}</Badge> : null}
            {step.optional ? <Badge>{t('badges.optional')}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-fg-muted">{t(`steps.${k}.body`)}</p>
          <p className="mt-1 text-xs text-fg-subtle">{t(`steps.${k}.tip`)}</p>
          {step.command ? (
            <div className="mt-2 flex items-center gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-surface-2 px-2 py-1.5 font-mono text-xs">{step.command}</pre>
              <CopyButton value={step.command} />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ButtonLink href={step.href} size="sm" variant={isNext ? 'primary' : 'secondary'}>
              {t(`steps.${k}.action`)}
            </ButtonLink>
            <a href={docsUrl(step.docs)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-ink underline">
              <BookOpen size={12} aria-hidden />
              {t('readDocs')}
            </a>
          </div>
        </div>
      </Card>
    </li>
  );
}
