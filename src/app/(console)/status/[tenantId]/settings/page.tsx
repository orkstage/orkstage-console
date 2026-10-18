// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { STATUS_VISIBILITIES, type MaintenanceDto, type StatusPageSettingsDto, type StatusVisibility } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ExternalLink, Save, Square, Trash2, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { StatusDot } from '@/components/ui/status-badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useFormat } from '@/i18n/format';
import { apiGet, apiSend, qs } from '@/lib/api';
import { useTenants } from '@/lib/queries';

/** Status page settings of a tenant (open item 8): visibility, components and maintenance. */
export default function StatusSettingsPage() {
  const t = useTranslations('statusSettings');
  const { tenantId } = useParams<{ tenantId: string }>();
  const tenants = useTenants();
  const tenantName = tenants.data?.find((x) => x.id === tenantId)?.name ?? '';
  const settings = useQuery({
    queryKey: ['status-settings', tenantId],
    queryFn: ({ signal }) => apiGet<StatusPageSettingsDto>(`/status-pages/${tenantId}/settings`, { signal }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description', { tenant: tenantName })}
        breadcrumb={
          <Link href={`/status/${tenantId}`} className="hover:underline">
            {t('back')}
          </Link>
        }
      />
      {settings.isPending ? (
        <PageSpinner />
      ) : settings.error ? (
        <ErrorNotice error={settings.error} />
      ) : (
        <>
          <VisibilityCard s={settings.data} />
          <ComponentsCard s={settings.data} />
          <MaintenanceSection tenantId={tenantId} s={settings.data} />
        </>
      )}
    </div>
  );
}

function VisibilityCard({ s }: { s: StatusPageSettingsDto }) {
  const t = useTranslations('statusSettings');
  const qc = useQueryClient();
  const [visibility, setVisibility] = useState<StatusVisibility>(s.visibility);
  const [slug, setSlug] = useState(s.slug ?? '');
  const [title, setTitle] = useState(s.title ?? '');
  const [description, setDescription] = useState(s.description ?? '');
  const save = useMutation({
    mutationFn: () =>
      apiSend<StatusPageSettingsDto>('PUT', `/status-pages/${s.tenantId}`, {
        visibility,
        slug: slug.trim() || null,
        title: title.trim() || null,
        description: description.trim() || null,
      }),
    onSuccess: (data) => {
      qc.setQueryData(['status-settings', s.tenantId], data);
      void qc.invalidateQueries({ queryKey: ['status', s.tenantId] });
    },
  });
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const slugValid = /^[a-z0-9][a-z0-9-]{2,40}$/.test(slug);

  return (
    <Card>
      <CardHeader title={t('page')} description={t('subscribers', { count: s.confirmedSubscribers })} />
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label={t('visibility')} htmlFor="sp-visibility" hint={t(`visibilityHints.${visibility}`)}>
          <Select id="sp-visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as StatusVisibility)}>
            {STATUS_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {t(`visibilities.${v}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('slug')} htmlFor="sp-slug" hint={t('slugHint')} required={visibility === 'PUBLIC'}>
            <div className="flex items-center gap-1">
              <span className="shrink-0 font-mono text-xs text-fg-subtle">{origin}/s/</span>
              <Input id="sp-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="acme" />
            </div>
          </Field>
          <Field label={t('pageTitle')} htmlFor="sp-title" hint={t('pageTitleHint')}>
            <Input id="sp-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <Field label={t('pageDescription')} htmlFor="sp-description">
          <Textarea id="sp-description" value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {save.error ? <ErrorNotice error={save.error} /> : null}
        {save.isSuccess ? <Notice tone="ok">{t('saved')}</Notice> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {s.visibility === 'PUBLIC' && s.slug ? (
            <a className="mr-auto inline-flex items-center gap-1 text-sm text-accent-ink hover:underline" href={`/s/${s.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink size={13} aria-hidden /> {t('openPublic')}
            </a>
          ) : null}
          <Button type="submit" variant="primary" loading={save.isPending} disabled={(visibility === 'PUBLIC' || slug !== '') && !slugValid}>
            <Save size={14} aria-hidden /> {t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ComponentsCard({ s }: { s: StatusPageSettingsDto }) {
  const t = useTranslations('statusSettings');
  return (
    <Card>
      <CardHeader title={t('components')} description={t('componentsHint')} />
      {s.components.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-fg-subtle">{t('noComponents')}</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t('instance')}</TH>
              <TH>{t('component')}</TH>
              <TH>{t('label')}</TH>
              <TH>{t('order')}</TH>
              <TH>{t('shown')}</TH>
              <TH>
                <span className="sr-only">{t('save')}</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {s.components.map((c) => (
              <ComponentRow key={c.id} tenantId={s.tenantId} c={c} />
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function ComponentRow({ tenantId, c }: { tenantId: string; c: StatusPageSettingsDto['components'][number] }) {
  const t = useTranslations('statusSettings');
  const qc = useQueryClient();
  const [label, setLabel] = useState(c.label ?? '');
  const [order, setOrder] = useState(c.sortOrder === null ? '' : String(c.sortOrder));
  const [shown, setShown] = useState(!c.hidden);
  const dirty = label !== (c.label ?? '') || order !== (c.sortOrder === null ? '' : String(c.sortOrder)) || shown === c.hidden;
  const save = useMutation({
    mutationFn: () =>
      apiSend('PATCH', `/status-pages/${tenantId}/components/${c.id}`, { label: label.trim() || null, sortOrder: order === '' ? null : Number(order), hidden: !shown }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['status-settings', tenantId] });
      void qc.invalidateQueries({ queryKey: ['status', tenantId] });
    },
  });
  return (
    <TR>
      <TD className="text-sm">{c.instanceName}</TD>
      <TD className="text-sm">
        <span className="flex items-center gap-2">
          <StatusDot status={c.status} />
          {c.name}
        </span>
      </TD>
      <TD>
        <Input aria-label={`${t('label')}: ${c.name}`} value={label} maxLength={40} placeholder={c.name} onChange={(e) => setLabel(e.target.value)} className="h-8 w-40" />
      </TD>
      <TD>
        <Input aria-label={`${t('order')}: ${c.name}`} type="number" min={0} max={999} value={order} onChange={(e) => setOrder(e.target.value)} className="h-8 w-20" />
      </TD>
      <TD>
        <input type="checkbox" aria-label={`${t('shown')}: ${c.name}`} checked={shown} onChange={(e) => setShown(e.target.checked)} />
      </TD>
      <TD className="text-right">
        <Button size="sm" variant={dirty ? 'primary' : 'ghost'} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()} aria-label={t('saveComponent', { name: c.name })}>
          <Save size={13} aria-hidden />
        </Button>
        {save.error ? <ErrorNotice error={save.error} className="mt-1" /> : null}
      </TD>
    </TR>
  );
}

function MaintenanceSection({ tenantId, s }: { tenantId: string; s: StatusPageSettingsDto }) {
  const t = useTranslations('statusSettings');
  const tp = useTranslations('statusPage');
  const fmt = useFormat();
  const qc = useQueryClient();
  const [past, setPast] = useState(false);
  const [open, setOpen] = useState(false);
  const windows = useQuery({
    queryKey: ['maintenance', tenantId, past],
    queryFn: ({ signal }) => apiGet<MaintenanceDto[]>(`/maintenance-windows${qs({ tenantId, include: past ? 'past' : undefined })}`, { signal }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['maintenance', tenantId] });
    void qc.invalidateQueries({ queryKey: ['status', tenantId] });
  };
  const remove = useMutation({ mutationFn: (id: string) => apiSend('DELETE', `/maintenance-windows/${id}`), onSuccess: refresh });

  return (
    <Card>
      <CardHeader
        title={t('maintenance')}
        description={t('maintenanceHint')}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <CalendarPlus size={14} aria-hidden /> {t('schedule')}
          </Button>
        }
      />
      <label className="flex items-center gap-2 px-4 pb-3 text-sm">
        <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> {t('showPast')}
      </label>
      {remove.error ? <ErrorNotice error={remove.error} className="mx-4 mb-3" /> : null}
      {windows.isPending ? (
        <PageSpinner />
      ) : windows.error ? (
        <ErrorNotice error={windows.error} className="m-4" />
      ) : windows.data.length === 0 ? (
        <EmptyState icon={Wrench} title={t('noMaintenance')} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t('mTitle')}</TH>
              <TH>{t('when')}</TH>
              <TH>{t('mComponents')}</TH>
              <TH>{t('state')}</TH>
              <TH>
                <span className="sr-only">{t('cancel')}</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {windows.data.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.title}</TD>
                <TD className="text-xs">{tp('maintenanceWhen', { start: fmt.dateTime(m.startsAt), end: fmt.dateTime(m.endsAt) })}</TD>
                <TD className="text-xs">{[m.instanceName ?? t('allInstances'), m.componentNames.length ? m.componentNames.join(', ') : tp('allComponents')].join(' · ')}</TD>
                <TD>
                  <Badge tone={m.state === 'in_progress' ? 'info' : 'neutral'}>{tp(`states.${m.state}`)}</Badge>
                </TD>
                <TD className="text-right">
                  {m.state !== 'completed' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(m.id)}
                      aria-label={m.state === 'in_progress' ? t('endMaintenance', { title: m.title }) : t('cancelMaintenance', { title: m.title })}
                    >
                      {m.state === 'in_progress' ? <Square size={13} aria-hidden /> : <Trash2 size={13} aria-hidden />}
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('schedule')} size="lg">
        {open ? (
          <MaintenanceForm
            tenantId={tenantId}
            components={s.components}
            onDone={() => {
              setOpen(false);
              refresh();
            }}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}

/** `datetime-local` value (local time, minutes) for a date. */
function localInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MaintenanceForm({ tenantId, components, onDone }: { tenantId: string; components: StatusPageSettingsDto['components']; onDone: () => void }) {
  const t = useTranslations('statusSettings');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(() => localInput(new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000)));
  const [endsAt, setEndsAt] = useState(() => localInput(new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + 3_600_000)));
  const instances = [...new Map(components.map((c) => [c.instanceId, c.instanceName])).entries()];
  const componentNames = [...new Set(components.filter((c) => !instanceId || c.instanceId === instanceId).map((c) => c.name))];
  const save = useMutation({
    mutationFn: () =>
      apiSend('POST', '/maintenance-windows', {
        tenantId,
        instanceId: instanceId || null,
        title: title.trim(),
        message: message.trim() || null,
        componentNames: names.filter((n) => componentNames.includes(n)),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      }),
    onSuccess: onDone,
  });
  const valid = title.trim().length >= 3 && startsAt && endsAt && new Date(endsAt) > new Date(startsAt);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Field label={t('mTitle')} htmlFor="mw-title" required>
        <Input id="mw-title" value={title} maxLength={120} placeholder={t('mTitlePlaceholder')} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t('mMessage')} htmlFor="mw-message">
        <Textarea id="mw-message" value={message} maxLength={2000} rows={3} placeholder={t('mMessagePlaceholder')} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('startsAt')} htmlFor="mw-starts" required>
          <Input id="mw-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label={t('endsAt')} htmlFor="mw-ends" required>
          <Input id="mw-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <Field label={t('mInstance')} htmlFor="mw-instance">
        <Select id="mw-instance" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
          <option value="">{t('allInstances')}</option>
          {instances.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
      {componentNames.length > 0 ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{t('mComponents')}</legend>
          <p className="mb-2 text-xs text-fg-subtle">{t('mComponentsHint')}</p>
          <div className="flex flex-wrap gap-3">
            {componentNames.map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={names.includes(n)} onChange={(e) => setNames((prev) => (e.target.checked ? [...prev, n] : prev.filter((x) => x !== n)))} /> {n}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {save.error ? <ErrorNotice error={save.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={!valid} loading={save.isPending}>
          {t('scheduleSave')}
        </Button>
      </div>
    </form>
  );
}
