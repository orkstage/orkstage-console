// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { ALERT_SEVERITIES, createAlertRuleSchema, PLATFORM_METRICS, type AlertRuleDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorNotice } from '@/components/ui/error-notice';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { isPlatformStaff, useCan, useMe } from '@/lib/ability';
import { apiGet, apiSend } from '@/lib/api';
import { tenantNameMap, useTenants } from '@/lib/queries';

type Metric = (typeof PLATFORM_METRICS)[number];
type Severity = (typeof ALERT_SEVERITIES)[number];
type Operator = '>' | '>=' | '<' | '<=';
const OPERATORS: Operator[] = ['>', '>=', '<', '<='];
const RESOURCE_TYPES = ['compute.container-service', 'ingress', 'database.postgresql', 'cache.redis'] as const;

interface Draft {
  tenantId: string;
  name: string;
  signal: 'health' | 'metric';
  consecutiveFailures: number;
  critical: boolean;
  metric: Metric;
  operator: Operator;
  threshold: number;
  windowMinutes: number;
  statistic: 'avg' | 'max' | 'min';
  resourceType: string;
  severity: Severity;
  notify: boolean;
  cooldownMinutes: number;
  autoResolve: boolean;
  enabled: boolean;
}

function draftFrom(rule: AlertRuleDto | null, tenantId: string): Draft {
  const c = rule?.condition;
  return {
    tenantId: rule ? (rule.tenantId ?? '') : tenantId,
    name: rule?.name ?? '',
    signal: c?.signal ?? 'metric',
    consecutiveFailures: c?.signal === 'health' ? c.consecutiveFailures : 3,
    critical: c?.signal === 'health' ? Boolean(c.critical) : true,
    metric: (c?.signal === 'metric' ? c.metric : 'cpu') as Metric,
    operator: c?.signal === 'metric' ? c.operator : '>',
    threshold: c?.signal === 'metric' ? c.threshold : 80,
    windowMinutes: c?.signal === 'metric' ? c.windowMinutes : 5,
    statistic: c?.signal === 'metric' ? c.statistic : 'avg',
    resourceType: c?.signal === 'metric' ? (c.resourceTypes?.[0] ?? '') : '',
    severity: (rule?.severity as Severity) ?? 'medium',
    notify: rule ? rule.actions.includes('notify_owners') : true,
    cooldownMinutes: Math.round((rule?.cooldownSeconds ?? 900) / 60),
    autoResolve: rule?.autoResolve ?? true,
    enabled: rule?.enabled ?? true,
  };
}

function body(d: Draft) {
  return {
    name: d.name.trim(),
    condition:
      d.signal === 'health'
        ? { signal: 'health' as const, consecutiveFailures: d.consecutiveFailures, critical: d.critical }
        : {
            signal: 'metric' as const,
            metric: d.metric,
            operator: d.operator,
            threshold: d.threshold,
            windowMinutes: d.windowMinutes,
            statistic: d.statistic,
            ...(d.resourceType ? { resourceTypes: [d.resourceType] } : {}),
          },
    severity: d.severity,
    actions: d.notify ? ['create_incident' as const, 'notify_owners' as const] : ['create_incident' as const],
    cooldownSeconds: d.cooldownMinutes * 60,
    autoResolve: d.autoResolve,
    enabled: d.enabled,
  };
}

/** Alert rules (open item 7): what opens an incident, by health checks or by a metric threshold. */
export default function AlertRulesPage() {
  const t = useTranslations('alerts');
  const qc = useQueryClient();
  const me = useMe();
  const can = useCan();
  const staff = isPlatformStaff(me.data);
  const tenants = useTenants();
  const names = tenantNameMap(tenants.data);
  const rules = useQuery({ queryKey: ['alert-rules'], queryFn: ({ signal }) => apiGet<AlertRuleDto[]>('/alert-rules', { signal }) });
  const [editing, setEditing] = useState<AlertRuleDto | 'new' | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['alert-rules'] });
  const remove = useMutation({ mutationFn: (id: string) => apiSend('DELETE', `/alert-rules/${id}`), onSuccess: refresh });
  const firstTenant = me.data?.memberships.find((m) => m.role === 'CustomerOwner' || m.role === 'CustomerAdmin')?.tenantId ?? '';
  const canEdit = (r: AlertRuleDto) => can('update', 'AlertRule', r.tenantId);
  const canCreate = staff || Boolean(firstTenant);

  const describe = (r: AlertRuleDto) =>
    r.condition.signal === 'health'
      ? t('healthCondition', { count: r.condition.consecutiveFailures })
      : t('metricCondition', {
          metric: t(`metrics.${r.condition.metric as Metric}`),
          statistic: t(`statistics.${r.condition.statistic}`),
          operator: r.condition.operator,
          threshold: r.condition.threshold,
          minutes: r.condition.windowMinutes,
        });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={14} aria-hidden /> {t('add')}
            </Button>
          ) : null
        }
      />
      {remove.error ? <ErrorNotice error={remove.error} className="mb-4" /> : null}
      <Card>
        {rules.isPending ? (
          <PageSpinner />
        ) : rules.error ? (
          <ErrorNotice error={rules.error} className="m-4" />
        ) : rules.data.length === 0 ? (
          <EmptyState icon={BellRing} title={t('emptyTitle')} description={t('emptyBody')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('name')}</TH>
                <TH>{t('condition')}</TH>
                <TH>{t('severity')}</TH>
                <TH>{t('scope')}</TH>
                <TH>{t('state')}</TH>
                <TH>
                  <span className="sr-only">{t('actions')}</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rules.data.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-sm">{describe(r)}</TD>
                  <TD>
                    <Badge tone={r.severity === 'critical' || r.severity === 'high' ? 'danger' : r.severity === 'medium' ? 'warn' : 'neutral'}>{t(`severities.${r.severity as Severity}`)}</Badge>
                  </TD>
                  <TD className="text-sm">{r.tenantId ? (names.get(r.tenantId) ?? t('tenantRule')) : t('platformRule')}</TD>
                  <TD className="text-xs">
                    {r.enabled ? t('enabled') : t('disabled')}
                    {r.autoResolve ? ` · ${t('autoResolves')}` : ''}
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    {canEdit(r) ? (
                      <span className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={t('editRule', { name: r.name })}>
                          <Pencil size={13} aria-hidden />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)} aria-label={t('deleteRule', { name: r.name })}>
                          <Trash2 size={13} aria-hidden />
                        </Button>
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t('addTitle') : t('editTitle')} size="lg">
        {editing !== null ? (
          <RuleForm
            rule={editing === 'new' ? null : editing}
            staff={staff}
            defaultTenant={staff ? '' : firstTenant}
            tenants={(tenants.data ?? []).filter((x) => staff || me.data?.memberships.some((m) => m.tenantId === x.id && (m.role === 'CustomerOwner' || m.role === 'CustomerAdmin')))}
            onDone={() => {
              setEditing(null);
              refresh();
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function RuleForm({
  rule,
  staff,
  defaultTenant,
  tenants,
  onDone,
}: {
  rule: AlertRuleDto | null;
  staff: boolean;
  defaultTenant: string;
  tenants: { id: string; name: string }[];
  onDone: () => void;
}) {
  const t = useTranslations('alerts');
  const [d, setD] = useState<Draft>(() => draftFrom(rule, defaultTenant));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const save = useMutation({
    mutationFn: async () => {
      if (rule) return apiSend('PATCH', `/alert-rules/${rule.id}`, body(d));
      return apiSend('POST', '/alert-rules', createAlertRuleSchema.parse({ ...body(d), ...(d.tenantId ? { tenantId: d.tenantId } : {}) }));
    },
    onSuccess: onDone,
  });
  const valid = d.name.trim().length >= 2 && (staff || d.tenantId) && Number.isFinite(d.threshold);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('name')} htmlFor="ar-name" required>
          <Input id="ar-name" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder={t('namePlaceholder')} />
        </Field>
        <Field label={t('scope')} htmlFor="ar-scope" hint={rule ? t('scopeFixed') : undefined}>
          <Select id="ar-scope" value={d.tenantId} disabled={Boolean(rule)} onChange={(e) => set('tenantId', e.target.value)}>
            {staff ? <option value="">{t('platformRule')}</option> : null}
            {tenants.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t('signal')} htmlFor="ar-signal">
        <Select id="ar-signal" value={d.signal} onChange={(e) => set('signal', e.target.value as Draft['signal'])}>
          <option value="metric">{t('signals.metric')}</option>
          <option value="health">{t('signals.health')}</option>
        </Select>
      </Field>

      {d.signal === 'metric' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('metric')} htmlFor="ar-metric">
            <Select id="ar-metric" value={d.metric} onChange={(e) => set('metric', e.target.value as Metric)}>
              {PLATFORM_METRICS.map((m) => (
                <option key={m} value={m}>
                  {t(`metrics.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('statistic')} htmlFor="ar-stat">
            <Select id="ar-stat" value={d.statistic} onChange={(e) => set('statistic', e.target.value as Draft['statistic'])}>
              {(['avg', 'max', 'min'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`statistics.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('resourceType')} htmlFor="ar-type">
            <Select id="ar-type" value={d.resourceType} onChange={(e) => set('resourceType', e.target.value)}>
              <option value="">{t('anyResource')}</option>
              {RESOURCE_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {rt}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('operator')} htmlFor="ar-op">
            <Select id="ar-op" value={d.operator} onChange={(e) => set('operator', e.target.value as Operator)}>
              {OPERATORS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('threshold')} htmlFor="ar-threshold">
            <Input id="ar-threshold" type="number" value={d.threshold} onChange={(e) => set('threshold', Number(e.target.value))} />
          </Field>
          <Field label={t('window')} htmlFor="ar-window">
            <Input id="ar-window" type="number" min={1} max={60} value={d.windowMinutes} onChange={(e) => set('windowMinutes', Number(e.target.value))} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('failures')} htmlFor="ar-failures">
            <Input id="ar-failures" type="number" min={1} max={20} value={d.consecutiveFailures} onChange={(e) => set('consecutiveFailures', Number(e.target.value))} />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.critical} onChange={(e) => set('critical', e.target.checked)} /> {t('criticalOnly')}
          </label>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('severity')} htmlFor="ar-sev">
          <Select id="ar-sev" value={d.severity} onChange={(e) => set('severity', e.target.value as Severity)}>
            {ALERT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`severities.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('cooldown')} htmlFor="ar-cooldown" hint={t('cooldownHint')}>
          <Input id="ar-cooldown" type="number" min={0} max={1440} value={d.cooldownMinutes} onChange={(e) => set('cooldownMinutes', Number(e.target.value))} />
        </Field>
        <div className="space-y-1.5 pt-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.autoResolve} onChange={(e) => set('autoResolve', e.target.checked)} /> {t('autoResolve')}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.notify} onChange={(e) => set('notify', e.target.checked)} /> {t('notifyOwners')}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.enabled} onChange={(e) => set('enabled', e.target.checked)} /> {t('enabled')}
          </label>
        </div>
      </div>

      {save.error ? <ErrorNotice error={save.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{t('cancel')}</Button>
        <Button type="submit" variant="primary" disabled={!valid} loading={save.isPending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
