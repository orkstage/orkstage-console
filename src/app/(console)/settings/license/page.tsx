// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { ENTERPRISE_FEATURE_KEYS } from '@orkstage/contracts';
import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { EDITIONS_URL, FEATURE_MESSAGE } from '@/components/enterprise';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { KeyValues, PageHeader } from '@/components/ui/page-header';
import { PageSpinner } from '@/components/ui/spinner';
import { useFormat } from '@/i18n/format';
import { useLicense } from '@/lib/queries';

/**
 * Settings > License (enterprise-items.md E1): the edition, what the license grants and until when,
 * and how to install a key. The key itself is never sent to the console.
 */
export default function LicensePage() {
  const t = useTranslations('license');
  const te = useTranslations('enterprise');
  const fmt = useFormat();
  const license = useLicense();

  if (license.isPending) return <PageSpinner />;
  if (license.error) return <ErrorNotice error={license.error} />;
  const l = license.data;
  const tone = l.status === 'active' ? 'accent' : l.status === 'community' ? 'neutral' : 'warn';

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('current')} as="h2" />
          <CardBody className="space-y-3">
            <KeyValues
              items={[
                { label: t('edition'), value: <Badge tone={l.edition === 'enterprise' ? 'accent' : 'neutral'}>{t(`editions.${l.edition}`)}</Badge> },
                { label: t('status'), value: <Badge tone={tone}>{t(`statuses.${l.status}`)}</Badge> },
                { label: t('customer'), value: l.customer ?? fmt.empty },
                { label: t('expires'), value: l.expiresAt ? fmt.date(l.expiresAt) : fmt.empty },
              ]}
            />
            <p className="text-xs text-fg-muted">{l.message}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t('features')} description={t('featuresHint')} as="h2" />
          <CardBody>
            <ul className="space-y-1.5 text-sm">
              {ENTERPRISE_FEATURE_KEYS.map((key) => {
                const on = l.features.includes(key);
                return (
                  <li key={key} className="flex items-center gap-2">
                    {on ? <CheckCircle2 size={14} className="text-ok-ink" aria-hidden /> : <Circle size={14} className="text-fg-subtle" aria-hidden />}
                    <span className={on ? '' : 'text-fg-muted'}>{te(`features.${FEATURE_MESSAGE[key]}`)}</span>
                    <code className="font-mono text-[11px] text-fg-subtle">{key}</code>
                    <span className="sr-only">{on ? t('included') : t('notIncluded')}</span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title={t('install')} as="h2" />
        <CardBody className="space-y-2 text-sm">
          <p>{t('installBody')}</p>
          <pre className="overflow-x-auto rounded bg-surface-2 p-2 font-mono text-xs">ORKSTAGE_LICENSE_KEY=orkstage-license.v1....</pre>
          <p className="text-fg-muted">{t('installAfter')}</p>
          {l.status === 'community' ? (
            <Notice>
              {t('communityNote')}{' '}
              <a href={EDITIONS_URL} target="_blank" rel="noreferrer" className="text-accent-ink underline">
                {te('editionsLink')}
              </a>
            </Notice>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
