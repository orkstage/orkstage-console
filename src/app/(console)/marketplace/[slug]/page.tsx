// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { LISTING_BADGES, type ListingDetailDto, type UseListingResultDto } from '@orkstage/contracts';
import { PROVIDER_INFO } from '@orkstage/domain/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Rocket, Star } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { categoryKey, ListingBadges } from '@/components/marketplace/badges';
import { ProviderLogo, useResourceTypeLabel } from '@/components/resource-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { Field } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PageSpinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { YamlViewer } from '@/components/yaml-viewer';
import { useFormat } from '@/i18n/format';
import { apiGet, apiSend } from '@/lib/api';
import { useCan } from '@/lib/ability';
import { useDocumentTitle } from '@/lib/hooks';

export default function ListingPage() {
  const t = useTranslations('marketplace');
  const fmt = useFormat();
  const typeLabel = useResourceTypeLabel();
  const can = useCan();
  const router = useRouter();
  const qc = useQueryClient();
  const { slug } = useParams<{ slug: string }>();
  const listing = useQuery({ queryKey: ['marketplace', 'listing', slug], queryFn: ({ signal }) => apiGet<ListingDetailDto>(`/marketplace/listings/${slug}`, { signal }) });
  useDocumentTitle(listing.data?.title);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['marketplace'] });

  const star = useMutation({
    mutationFn: (on: boolean) => apiSend(on ? 'PUT' : 'DELETE', `/marketplace/listings/${listing.data!.id}/star`),
    onSuccess: refresh,
  });
  const use = useMutation({
    mutationFn: () => apiSend<UseListingResultDto>('POST', `/marketplace/listings/${listing.data!.id}/use`, {}),
    onSuccess: (r) => router.push(`/instances/new?template=${r.templateId}&version=${r.templateVersionId}`),
  });
  const clone = useMutation({
    mutationFn: () => {
      const l = listing.data!;
      return apiSend<{ id: string }>('POST', `/templates/${l.templateId}/clone`, { name: `${l.templateName}-copy-${Date.now().toString(36).slice(-4)}`, displayName: `${l.title} (copy)` });
    },
    onSuccess: (r) => router.push(`/templates/${r.id}`),
  });

  if (listing.isPending) return <PageSpinner />;
  if (listing.error) return <ErrorNotice error={listing.error} />;
  const l = listing.data;

  return (
    <>
      <PageHeader
        title={l.title}
        description={l.summary}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <ListingBadges badges={l.badges} />
            {l.status !== 'PUBLISHED' ? <StatusBadge status={l.status} /> : null}
            <span className="text-xs text-fg-muted">{t('by', { publisher: l.publisherName })}</span>
            {l.version ? <span className="text-xs text-fg-muted">{t('version', { version: l.version })}</span> : null}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => star.mutate(!l.starred)} loading={star.isPending} aria-pressed={l.starred}>
              <Star size={14} aria-hidden className={l.starred ? 'fill-current' : ''} /> {l.starred ? t('starred') : t('star')} ({l.stars})
            </Button>
            {can('create', 'Template') ? (
              <Button onClick={() => clone.mutate()} loading={clone.isPending}>
                <Copy size={14} aria-hidden /> {t('clone')}
              </Button>
            ) : null}
            {l.status === 'PUBLISHED' && can('create', 'Instance') ? (
              <Button variant="primary" onClick={() => use.mutate()} loading={use.isPending}>
                <Rocket size={14} aria-hidden /> {t('use')}
              </Button>
            ) : null}
          </div>
        }
      />
      {use.error ? <ErrorNotice error={use.error} /> : null}
      {clone.error ? <ErrorNotice error={clone.error} /> : null}
      {l.reviewNotes ? <Notice tone="info">{t('reviewNotes', { notes: l.reviewNotes })}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={t('about')} as="h2" />
            <CardBody>
              <p className="whitespace-pre-line text-sm">{l.description || l.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {l.categories.map((c) => (
                  <Badge key={c}>{t(`categories.${categoryKey(c)}` as never)}</Badge>
                ))}
                {l.tags.map((tag) => (
                  <Badge key={tag} tone="neutral">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('resources', { count: l.template.resources.length })} as="h2" />
            <Table>
              <THead>
                <TR>
                  <TH>{t('resource')}</TH>
                  <TH>{t('type')}</TH>
                  <TH>{t('slot')}</TH>
                  <TH className="text-right">{t('monthly')}</TH>
                </TR>
              </THead>
              <TBody>
                {l.template.resources.map((r) => {
                  const line = l.cost?.lines.find((x) => x.resourceId === r.id);
                  return (
                    <TR key={r.id}>
                      <TD className="font-mono text-xs">{r.id}</TD>
                      <TD>{typeLabel(r.type)}</TD>
                      <TD className="text-xs">{r.placement}</TD>
                      <TD className="text-right text-xs">{line?.monthly != null ? fmt.money(line.monthly) : t('notPriced')}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          {l.template.source ? (
            <Card>
              <CardHeader title={t('source')} as="h2" />
              <CardBody>
                <YamlViewer source={l.template.source} label={t('source')} />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('estimate')} as="h2" description={t('estimateHint')} />
            <CardBody>
              <p className="text-2xl font-semibold">{l.cost && l.cost.confidence !== 'unavailable' ? fmt.money(l.cost.total) : t('costUnknown')}</p>
              <p className="text-xs text-fg-muted">{t('perMonth')}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('placements')} as="h2" />
            <CardBody>
              <ul className="space-y-3">
                {l.template.placements.map((s) => (
                  <li key={s.name}>
                    <div className="text-sm font-medium">{s.name}</div>
                    {s.description ? <div className="text-xs text-fg-muted">{s.description}</div> : null}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {s.providers.length
                        ? s.providers.map((p) => (
                            <span key={p} className="flex items-center gap-1 text-xs">
                              <ProviderLogo provider={p} size={14} /> {PROVIDER_INFO[p as keyof typeof PROVIDER_INFO]?.displayName ?? p}
                            </span>
                          ))
                        : <span className="text-xs text-fg-subtle">{t('anyProvider')}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {l.template.triggers.length ? (
            <Card>
              <CardHeader title={t('triggers')} as="h2" />
              <CardBody>
                <ul className="space-y-1 text-sm">
                  {l.template.triggers.map((tr) => (
                    <li key={tr.name}>
                      <span className="font-medium">{tr.name}</span>{' '}
                      <code className="font-mono text-xs text-fg-muted">
                        {tr.resource}.{tr.action}
                      </code>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          {l.canReview ? <ReviewPanel listing={l} onDone={refresh} /> : null}
        </div>
      </div>
    </>
  );
}

function ReviewPanel({ listing, onDone }: { listing: ListingDetailDto; onDone: () => void }) {
  const t = useTranslations('marketplace');
  const [badges, setBadges] = useState<string[]>(listing.badges);
  const [notes, setNotes] = useState(listing.reviewNotes ?? '');
  const review = useMutation({
    mutationFn: (decision: 'approve' | 'reject' | 'unlist') => apiSend('POST', `/marketplace/listings/${listing.id}/review`, { decision, badges, notes: notes || undefined }),
    onSuccess: onDone,
  });
  return (
    <Card>
      <CardHeader title={t('reviewTitle')} as="h2" description={t('reviewHint')} />
      <CardBody className="space-y-3">
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-fg-muted">{t('badgesField')}</legend>
          {LISTING_BADGES.map((b) => (
            <label key={b} className="flex items-start gap-2 py-0.5 text-sm">
              <input type="checkbox" className="mt-1" checked={badges.includes(b)} onChange={(e) => setBadges((x) => (e.target.checked ? [...x, b] : x.filter((y) => y !== b)))} />
              <span>
                {t(`badges.${b}`)}
                <span className="block text-xs text-fg-muted">{t(`badgeHelp.${b}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field label={t('notes')} htmlFor="rv-notes">
          <Textarea id="rv-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {review.error ? <ErrorNotice error={review.error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="danger-outline" onClick={() => review.mutate('reject')} loading={review.isPending}>
            {t('reject')}
          </Button>
          {listing.status === 'PUBLISHED' ? (
            <Button onClick={() => review.mutate('unlist')} loading={review.isPending}>
              {t('unlist')}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => review.mutate('approve')} loading={review.isPending}>
            {listing.status === 'PUBLISHED' ? t('saveReview') : t('approve')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
