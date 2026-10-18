// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { DomainDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, RefreshCw, Rocket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormat } from '@/i18n/format';
import { apiGet, apiSend } from '@/lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { CopyButton } from '../ui/copy-button';
import { Dialog } from '../ui/dialog';
import { EmptyState } from '../ui/empty-state';
import { ErrorNotice, Notice } from '../ui/error-notice';
import { Field, Input } from '../ui/input';
import { Select } from '../ui/select';
import { PageSpinner } from '../ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '../ui/table';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';
const STATUS_TONE: Record<DomainDto['status'], Tone> = { VERIFIED: 'ok', PENDING_VERIFICATION: 'warn', FAILED: 'danger' };
const CERT_TONE: Record<DomainDto['certificateStatus'], Tone> = { NONE: 'neutral', PENDING_VALIDATION: 'warn', ISSUED: 'ok', EXPIRING: 'warn', EXPIRED: 'danger', FAILED: 'danger' };

/**
 * Domains of an instance (open item 9): the platform subdomain and custom domains, with the DNS
 * records their owner creates, ownership and certificate state, and when a deployment is needed.
 */
export function DomainsPanel({
  instanceId,
  resourceIds,
  canEdit,
  canDeploy,
  simulated,
  onDeploy,
}: {
  instanceId: string;
  /** `dns` and `web.frontend` resources of the instance, to choose from when there are several. */
  resourceIds: string[];
  canEdit: boolean;
  canDeploy: boolean;
  simulated: boolean;
  onDeploy: () => void;
}) {
  const t = useTranslations('domains');
  const fmt = useFormat();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const key = ['domains', instanceId];
  const domains = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiGet<DomainDto[]>(`/instances/${instanceId}/domains`, { signal }),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'PENDING_VERIFICATION' || d.certificateStatus === 'PENDING_VALIDATION') ? 10_000 : false),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const verify = useMutation({ mutationFn: (id: string) => apiSend('POST', `/domains/${id}/verify`), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => apiSend('DELETE', `/domains/${id}`), onSuccess: refresh });
  const simulate = useMutation({
    mutationFn: (d: DomainDto) => apiSend('POST', `/instances/${instanceId}/simulate`, { resourceId: d.resourceId, domain: { hostname: d.hostname, ownershipRecord: true } }),
    onSuccess: (_r, d) => verify.mutate(d.id),
  });
  const error = verify.error ?? remove.error ?? simulate.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-fg-muted">{t('hint')}</p>
        {canEdit ? (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden /> {t('add')}
          </Button>
        ) : null}
      </div>
      {error ? <ErrorNotice error={error} /> : null}
      {domains.isPending ? (
        <PageSpinner />
      ) : domains.error ? (
        <ErrorNotice error={domains.error} />
      ) : domains.data.length === 0 ? (
        <EmptyState icon={Globe} title={t('empty')} />
      ) : (
        <ul className="space-y-3">
          {domains.data.map((d) => (
            <li key={d.id} className="rounded-lg border border-border bg-surface p-4" aria-label={d.hostname}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{d.hostname}</span>
                <Badge tone="neutral">{t(`kinds.${d.kind}`)}</Badge>
                <Badge tone={STATUS_TONE[d.status]}>{t(`statuses.${d.status}`)}</Badge>
                <Badge tone={CERT_TONE[d.certificateStatus]}>
                  {t('certificate')}: {t(`certStatuses.${d.certificateStatus}`)}
                </Badge>
                {d.certificateExpiresAt ? <span className="text-xs text-fg-subtle">{t('expires', { date: fmt.date(d.certificateExpiresAt) })}</span> : null}
                <span className="ml-auto flex items-center gap-1">
                  {canEdit && d.kind === 'CUSTOM' && d.status !== 'VERIFIED' ? (
                    <>
                      {simulated ? (
                        <Button size="sm" onClick={() => simulate.mutate(d)} loading={simulate.isPending}>
                          {t('simulateRecord')}
                        </Button>
                      ) : null}
                      <Button size="sm" onClick={() => verify.mutate(d.id)} loading={verify.isPending && verify.variables === d.id}>
                        <RefreshCw size={13} aria-hidden /> {t('verify')}
                      </Button>
                    </>
                  ) : null}
                  {canEdit && d.kind === 'CUSTOM' ? (
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(d.id)} aria-label={t('remove', { hostname: d.hostname })}>
                      <Trash2 size={13} aria-hidden />
                    </Button>
                  ) : null}
                </span>
              </div>
              {d.lastError && d.status !== 'VERIFIED' ? (
                <p className="mt-1 text-xs text-fg-subtle">
                  {d.lastError}
                  {d.lastCheckedAt ? ` · ${t('lastChecked', { time: fmt.relative(d.lastCheckedAt) })}` : ''}
                </p>
              ) : null}
              {d.needsDeploy ? (
                <Notice tone="info" className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span>{t('needsDeploy')}</span>
                  {canDeploy ? (
                    <Button size="sm" variant="primary" onClick={onDeploy}>
                      <Rocket size={13} aria-hidden /> {t('deploy')}
                    </Button>
                  ) : null}
                </Notice>
              ) : null}
              {d.records.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-fg-muted">{t('records')}</p>
                  <Table>
                    <THead>
                      <tr>
                        <TH>{t('purpose')}</TH>
                        <TH>{t('type')}</TH>
                        <TH>{t('name')}</TH>
                        <TH>{t('value')}</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {d.records.map((r) => (
                        <TR key={`${r.purpose}-${r.name}-${r.type}`}>
                          <TD className="text-xs">{t(`purposes.${r.purpose}`)}</TD>
                          <TD className="font-mono text-xs">{r.type}</TD>
                          <TD className="font-mono text-xs">
                            <span className="break-all">{r.name}</span> <CopyButton value={r.name} />
                          </TD>
                          <TD className="font-mono text-xs">
                            <span className="break-all">{r.value}</span> <CopyButton value={r.value} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title={t('add')}>
        {adding ? (
          <AddDomainForm
            instanceId={instanceId}
            resourceIds={resourceIds}
            onDone={() => {
              setAdding(false);
              refresh();
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function AddDomainForm({ instanceId, resourceIds, onDone }: { instanceId: string; resourceIds: string[]; onDone: () => void }) {
  const t = useTranslations('domains');
  const [hostname, setHostname] = useState('');
  const [resourceId, setResourceId] = useState('');
  const add = useMutation({
    mutationFn: () => apiSend('POST', `/instances/${instanceId}/domains`, { hostname: hostname.trim(), ...(resourceId ? { resourceId } : {}) }),
    onSuccess: onDone,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <Field label={t('hostname')} htmlFor="dom-hostname" required>
        <Input id="dom-hostname" value={hostname} onChange={(e) => setHostname(e.target.value.toLowerCase())} placeholder={t('hostnamePlaceholder')} autoComplete="off" />
      </Field>
      {resourceIds.length > 1 ? (
        <Field label={t('resource')} htmlFor="dom-resource">
          <Select id="dom-resource" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
            <option value="">{t('anyResource')}</option>
            {resourceIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {add.error ? <ErrorNotice error={add.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={hostname.trim().length < 4} loading={add.isPending}>
          {t('addSave')}
        </Button>
      </div>
    </form>
  );
}
