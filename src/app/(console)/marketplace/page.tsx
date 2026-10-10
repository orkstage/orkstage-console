'use client';

import {
  LISTING_BADGES,
  MARKETPLACE_CATEGORIES,
  PROVIDERS,
  submitListingSchema,
  type ListingSummaryDto,
} from '@orkstage/contracts';
import { PROVIDER_INFO } from '@orkstage/domain/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Store } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { categoryKey, ListingBadges } from '@/components/marketplace/badges';
import { ProviderLogo } from '@/components/resource-icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorNotice } from '@/components/ui/error-notice';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format';
import { apiGet, apiSend } from '@/lib/api';
import { useCan } from '@/lib/ability';
import { useTemplates } from '@/lib/queries';

type Tab = 'browse' | 'review' | 'mine';

/**
 * Template marketplace: curated and community templates with review badges. Everyone browses;
 * template publishers submit; platform admins review.
 */
export default function MarketplacePage() {
  const t = useTranslations('marketplace');
  const can = useCan();
  const reviewer = can('approve', 'Marketplace');
  const publisher = can('publish', 'Template');
  const [tab, setTab] = useState<Tab>('browse');
  const [submitting, setSubmitting] = useState(false);
  const tabs = [
    { id: 'browse' as const, label: t('tabs.browse') },
    ...(reviewer ? [{ id: 'review' as const, label: t('tabs.review') }] : []),
    ...(publisher ? [{ id: 'mine' as const, label: t('tabs.mine') }] : []),
  ];

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          publisher ? (
            <Button variant="primary" onClick={() => setSubmitting(true)}>
              <Plus size={16} aria-hidden /> {t('submit')}
            </Button>
          ) : null
        }
      />
      {tabs.length > 1 ? <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('tabs.label')} idPrefix="mkt" className="mb-4" /> : null}
      {tab === 'browse' ? (
        <TabPanel id="browse" idPrefix="mkt">
          <Browse />
        </TabPanel>
      ) : null}
      {tab === 'review' ? (
        <TabPanel id="review" idPrefix="mkt">
          <ListingList query="?status=PENDING_REVIEW" empty={t('reviewEmpty')} />
        </TabPanel>
      ) : null}
      {tab === 'mine' ? (
        <TabPanel id="mine" idPrefix="mkt">
          <ListingList query="?mine=true" empty={t('mineEmpty')} showStatus />
        </TabPanel>
      ) : null}
      <SubmitDialog open={submitting} onClose={() => setSubmitting(false)} />
    </>
  );
}

function Browse() {
  const t = useTranslations('marketplace');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [badge, setBadge] = useState('');
  const [provider, setProvider] = useState('');
  const [sort, setSort] = useState('popular');
  const params = new URLSearchParams({ sort, ...(q ? { q } : {}), ...(category ? { category } : {}), ...(badge ? { badge } : {}), ...(provider ? { provider } : {}) });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t('search')} htmlFor="mkt-q" className="lg:col-span-2">
          <Input id="mkt-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} />
        </Field>
        <Field label={t('category')} htmlFor="mkt-category">
          <Select id="mkt-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('any')}</option>
            {MARKETPLACE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${categoryKey(c)}` as never)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('provider')} htmlFor="mkt-provider">
          <Select id="mkt-provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">{t('any')}</option>
            {PROVIDERS.filter((p) => p !== 'mock').map((p) => (
              <option key={p} value={p}>
                {PROVIDER_INFO[p].displayName}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('badge')} htmlFor="mkt-badge">
            <Select id="mkt-badge" value={badge} onChange={(e) => setBadge(e.target.value)}>
              <option value="">{t('any')}</option>
              {LISTING_BADGES.map((b) => (
                <option key={b} value={b}>
                  {t(`badges.${b}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('sort')} htmlFor="mkt-sort">
            <Select id="mkt-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              {(['popular', 'new', 'name'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`sorts.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
      <ListingList query={`?${params.toString()}`} empty={t('browseEmpty')} />
    </div>
  );
}

function ListingList({ query, empty, showStatus }: { query: string; empty: string; showStatus?: boolean }) {
  const listings = useQuery({ queryKey: ['marketplace', query], queryFn: ({ signal }) => apiGet<ListingSummaryDto[]>(`/marketplace/listings${query}`, { signal }) });
  if (listings.isPending) return <PageSpinner />;
  if (listings.error) return <ErrorNotice error={listings.error} />;
  if (!listings.data.length) return <EmptyState icon={Store} title={empty} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {listings.data.map((l) => (
        <li key={l.id}>
          <ListingCard listing={l} showStatus={showStatus} />
        </li>
      ))}
    </ul>
  );
}

function ListingCard({ listing: l, showStatus }: { listing: ListingSummaryDto; showStatus?: boolean }) {
  const t = useTranslations('marketplace');
  const fmt = useFormat();
  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/marketplace/${l.slug}`} className="font-semibold hover:underline">
          {l.title}
        </Link>
        {showStatus ? <StatusBadge status={l.status} /> : null}
      </div>
      <ListingBadges badges={l.badges} />
      <p className="flex-1 text-sm text-fg-muted">{l.summary}</p>
      <div className="flex flex-wrap items-center gap-1.5" aria-label={t('providers')}>
        {l.providers.length ? (
          l.providers.slice(0, 8).map((p) => (
            <span key={p} title={PROVIDER_INFO[p as keyof typeof PROVIDER_INFO]?.displayName ?? p}>
              <ProviderLogo provider={p} size={16} />
            </span>
          ))
        ) : (
          <span className="text-xs text-fg-subtle">{t('anyProvider')}</span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span>{l.estimatedMonthlyCost !== null ? t('fromCost', { cost: fmt.money(l.estimatedMonthlyCost) }) : t('costUnknown')}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1" title={t('stars')}>
            <Star size={12} aria-hidden className={l.starred ? 'fill-current' : ''} /> {l.stars}
          </span>
          <span>{t('uses', { count: l.useCount })}</span>
        </span>
      </div>
      <div className="text-xs text-fg-subtle">{t('by', { publisher: l.publisherName })}</div>
    </Card>
  );
}

function SubmitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');
  const qc = useQueryClient();
  const templates = useTemplates(open);
  const [form, setForm] = useState({ templateId: '', slug: '', title: '', summary: '', description: '', categories: [] as string[], tags: '' });
  const [error, setError] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: (body: unknown) => apiSend('POST', '/marketplace/listings', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['marketplace'] });
      onClose();
    },
  });
  const publishable = (templates.data ?? []).filter((x) => x.latestPublished);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = submitListingSchema.safeParse({ ...form, tags: form.tags.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
      return;
    }
    submit.mutate(parsed.data);
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onClose={onClose} title={t('submitTitle')} description={t('submitDescription')} size="lg">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <Field label={t('template')} htmlFor="sub-template" required>
          <Select
            id="sub-template"
            value={form.templateId}
            onChange={(e) => {
              const tpl = publishable.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, templateId: e.target.value, slug: f.slug || tpl?.name || '', title: f.title || tpl?.displayName || '', summary: f.summary || tpl?.description?.slice(0, 240) || '' }));
            }}
          >
            <option value="">{tc('empty')}</option>
            {publishable.map((x) => (
              <option key={x.id} value={x.id}>
                {x.displayName} ({x.latestPublished?.version})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('slug')} htmlFor="sub-slug" required>
            <Input id="sub-slug" className="font-mono" value={form.slug} onChange={set('slug')} />
          </Field>
          <Field label={t('titleField')} htmlFor="sub-title" required>
            <Input id="sub-title" value={form.title} onChange={set('title')} />
          </Field>
        </div>
        <Field label={t('summary')} htmlFor="sub-summary" required>
          <Input id="sub-summary" value={form.summary} onChange={set('summary')} maxLength={240} />
        </Field>
        <Field label={t('descriptionField')} htmlFor="sub-description" hint={t('descriptionHint')}>
          <Textarea id="sub-description" rows={5} value={form.description} onChange={set('description')} />
        </Field>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-fg-muted">{t('categoriesField')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {MARKETPLACE_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.categories.includes(c)}
                  onChange={(e) => setForm((f) => ({ ...f, categories: e.target.checked ? [...f.categories, c] : f.categories.filter((x) => x !== c) }))}
                />
                {t(`categories.${categoryKey(c)}` as never)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t('tags')} htmlFor="sub-tags" hint={t('tagsHint')}>
          <Input id="sub-tags" value={form.tags} onChange={set('tags')} />
        </Field>
        {error ? <ErrorNotice error={new Error(error)} /> : null}
        {submit.error ? <ErrorNotice error={submit.error} /> : null}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" variant="primary" loading={submit.isPending}>
            {t('submitForReview')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
