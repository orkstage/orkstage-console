// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { Page, TriggerDto, TriggerRunDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Zap } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormat } from '@/i18n/format';
import { apiGet, apiSend, asItems } from '@/lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ErrorNotice } from '../ui/error-notice';
import { Field, Input } from '../ui/input';
import { Select } from '../ui/select';
import { PageSpinner } from '../ui/spinner';
import { StatusBadge } from '../ui/status-badge';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

type ParamValue = string | number | boolean;

/**
 * Template triggers of one instance: run them by hand with their overridable parameters, see how
 * CI can call them with an API key, and follow recent runs.
 */
export function TriggersPanel({ instanceId, canRun }: { instanceId: string; canRun: boolean }) {
  const t = useTranslations('triggers');
  const fmt = useFormat();
  const triggers = useQuery({
    queryKey: ['instance', instanceId, 'triggers'],
    queryFn: ({ signal }) => apiGet<TriggerDto[]>(`/instances/${instanceId}/triggers`, { signal }),
  });
  const runs = useQuery({
    queryKey: ['instance', instanceId, 'trigger-runs'],
    queryFn: ({ signal }) => apiGet<Page<TriggerRunDto>>(`/instances/${instanceId}/trigger-runs?limit=20`, { signal }),
    refetchInterval: (q) => (asItems(q.state.data).some((r) => r.status === 'QUEUED' || r.status === 'RUNNING') ? 3000 : false),
  });
  const [open, setOpen] = useState<string | null>(null);

  if (triggers.isPending) return <PageSpinner />;
  if (triggers.error) return <ErrorNotice error={triggers.error} />;
  if (!triggers.data.length) return <EmptyState icon={Zap} title={t('emptyTitle')} description={t('emptyBody')} />;

  return (
    <div className="space-y-6">
      <Table>
        <THead>
          <TR>
            <TH>{t('name')}</TH>
            <TH>{t('action')}</TH>
            <TH>{t('runsOn')}</TH>
            <TH>{t('lastRun')}</TH>
            <TH className="text-right">
              <span className="sr-only">{t('run')}</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {triggers.data.map((tr) => (
            <TR key={tr.name}>
              <TD>
                <div className="font-medium">{tr.name}</div>
                {tr.description ? <div className="text-xs text-fg-muted">{tr.description}</div> : null}
              </TD>
              <TD>
                <code className="font-mono text-xs">
                  {tr.resourceId}.{tr.action}
                </code>
                {tr.provider ? <div className="text-xs text-fg-subtle">{tr.provider}</div> : null}
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {tr.on.manual ? <Badge>{t('manual')}</Badge> : null}
                  {tr.on.webhook ? <Badge tone="info">{t('webhook')}</Badge> : null}
                  {tr.on.schedule ? (
                    <Badge title={t('scheduleUtc')}>
                      <code className="font-mono">{tr.on.schedule}</code>
                    </Badge>
                  ) : null}
                </div>
              </TD>
              <TD>{tr.lastRun ? <StatusBadge status={tr.lastRun.status} /> : <span className="text-xs text-fg-subtle">{t('never')}</span>}</TD>
              <TD className="text-right">
                {canRun && tr.on.manual ? (
                  <Button size="sm" disabled={!tr.available} title={tr.unavailableReason ?? undefined} onClick={() => setOpen(open === tr.name ? null : tr.name)}>
                    <Play size={14} aria-hidden /> {t('run')}
                  </Button>
                ) : null}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {open ? <RunForm instanceId={instanceId} trigger={triggers.data.find((x) => x.name === open)!} onDone={() => setOpen(null)} /> : null}

      {triggers.data.some((x) => x.on.webhook) ? <WebhookHint instanceId={instanceId} trigger={triggers.data.find((x) => x.on.webhook)!} /> : null}

      <section aria-labelledby="trigger-runs">
        <h3 id="trigger-runs" className="mb-2 text-sm font-semibold">
          {t('recentRuns')}
        </h3>
        {runs.error ? <ErrorNotice error={runs.error} /> : null}
        <Table>
          <THead>
            <TR>
              <TH>{t('name')}</TH>
              <TH>{t('source')}</TH>
              <TH>{t('status')}</TH>
              <TH>{t('message')}</TH>
              <TH>{t('when')}</TH>
            </TR>
          </THead>
          <TBody>
            {asItems(runs.data).map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.trigger}</TD>
                <TD>{t(`sources.${r.source}`)}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD className="max-w-md text-xs">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                      {r.message ?? r.url}
                    </a>
                  ) : (
                    r.message
                  )}
                </TD>
                <TD className="whitespace-nowrap text-xs text-fg-muted">{fmt.relative(r.queuedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>
    </div>
  );
}

function RunForm({ instanceId, trigger, onDone }: { instanceId: string; trigger: TriggerDto; onDone: () => void }) {
  const t = useTranslations('triggers');
  const tc = useTranslations('common');
  const qc = useQueryClient();
  const editable = trigger.actionParams.filter((p) => trigger.overridable.includes(p.name));
  const [values, setValues] = useState<Record<string, ParamValue | undefined>>(() => Object.fromEntries(editable.map((p) => [p.name, trigger.params[p.name]])));
  const run = useMutation({
    mutationFn: () => {
      const params = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''));
      return apiSend<TriggerRunDto>('POST', `/instances/${instanceId}/triggers/${trigger.name}/runs`, { params });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['instance', instanceId, 'trigger-runs'] });
      void qc.invalidateQueries({ queryKey: ['instance', instanceId, 'triggers'] });
      onDone();
    },
  });

  return (
    <form
      className="space-y-3 rounded-md border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate();
      }}
    >
      <h3 className="text-sm font-semibold">{t('runTitle', { name: trigger.name })}</h3>
      {Object.keys(trigger.params).length ? (
        <p className="text-xs text-fg-muted">
          {t('defaults')}{' '}
          <code className="font-mono">{JSON.stringify(trigger.params)}</code>
        </p>
      ) : null}
      {editable.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {editable.map((p) => {
            const id = `trg-${trigger.name}-${p.name}`;
            const value = values[p.name];
            const set = (v: ParamValue | undefined) => setValues((prev) => ({ ...prev, [p.name]: v }));
            return (
              <Field key={p.name} label={<code className="font-mono">{p.name}</code>} htmlFor={id} hint={p.description} required={p.required}>
                {p.type === 'boolean' ? (
                  <Select id={id} value={value === undefined ? '' : String(value)} onChange={(e) => set(e.target.value === '' ? undefined : e.target.value === 'true')}>
                    <option value="">{tc('empty')}</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    className="font-mono"
                    type={p.type === 'number' ? 'number' : 'text'}
                    value={value === undefined ? '' : String(value)}
                    onChange={(e) => set(e.target.value === '' ? undefined : p.type === 'number' ? Number(e.target.value) : e.target.value)}
                  />
                )}
              </Field>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-fg-muted">{t('noOverrides')}</p>
      )}
      {run.error ? <ErrorNotice error={run.error} /> : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>{tc('cancel')}</Button>
        <Button type="submit" variant="primary" loading={run.isPending}>
          <Play size={14} aria-hidden /> {t('run')}
        </Button>
      </div>
    </form>
  );
}

function WebhookHint({ instanceId, trigger }: { instanceId: string; trigger: TriggerDto }) {
  const t = useTranslations('triggers');
  const example = Object.fromEntries(trigger.overridable.map((name) => [name, trigger.params[name] ?? '...']));
  const snippet = [
    `curl -X POST "$ORKSTAGE_API/instances/${instanceId}/triggers/${trigger.name}/runs" \\`,
    '  -H "Authorization: Bearer $ORKSTAGE_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '${JSON.stringify({ params: example })}'`,
  ].join('\n');
  return (
    <section aria-labelledby="trigger-webhook" className="space-y-2">
      <h3 id="trigger-webhook" className="text-sm font-semibold">
        {t('webhookTitle')}
      </h3>
      <p className="text-xs text-fg-muted">{t('webhookBody')}</p>
      <pre className="overflow-x-auto rounded bg-surface-2 p-3 font-mono text-xs">{snippet}</pre>
    </section>
  );
}
