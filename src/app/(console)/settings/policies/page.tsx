// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { PolicyConfigDto, TenantPolicyDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { isPlatformStaff, useCan, useMe } from '@/lib/ability';
import { apiGet, apiSend } from '@/lib/api';
import { useTenants } from '@/lib/queries';

interface Draft {
  allowedRegions: string;
  maxMonthlyCostUsd: string;
  maxReplicas: string;
  machineSizes: string;
  approvedRegistries: string;
  requiredLabels: string;
  minTlsVersion: '' | '1.2' | '1.3';
  minLogRetentionDays: string;
  disabled: string[];
}

const words = (v: string) => v.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

function toDraft(p: PolicyConfigDto): Draft {
  return {
    allowedRegions: (p.allowedRegions ?? []).join(', '),
    maxMonthlyCostUsd: p.maxMonthlyCostUsd?.toString() ?? '',
    maxReplicas: p.maxReplicas?.toString() ?? '',
    machineSizes: (p.machineSizes ?? []).map((s) => `${s.cpu}/${s.memoryMiB}`).join('\n'),
    approvedRegistries: (p.approvedRegistries ?? []).join('\n'),
    requiredLabels: (p.requiredLabels ?? []).join(', '),
    minTlsVersion: p.minTlsVersion ?? '',
    minLogRetentionDays: p.minLogRetentionDays?.toString() ?? '',
    disabled: p.disabled ?? [],
  };
}

/** The policy from the form; null when a size is not written as vCPU/MiB. */
function fromDraft(d: Draft, platform: boolean): PolicyConfigDto | null {
  const sizes = lines(d.machineSizes).map((l) => /^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/.exec(l));
  if (sizes.some((m) => !m)) return null;
  const p: PolicyConfigDto = {};
  if (d.allowedRegions.trim()) p.allowedRegions = words(d.allowedRegions);
  if (d.maxMonthlyCostUsd.trim()) p.maxMonthlyCostUsd = Number(d.maxMonthlyCostUsd);
  if (d.maxReplicas.trim()) p.maxReplicas = Number(d.maxReplicas);
  if (sizes.length) p.machineSizes = sizes.map((m) => ({ cpu: Number(m![1]), memoryMiB: Number(m![2]) }));
  if (d.approvedRegistries.trim()) p.approvedRegistries = lines(d.approvedRegistries);
  if (d.requiredLabels.trim()) p.requiredLabels = words(d.requiredLabels);
  if (d.minTlsVersion) p.minTlsVersion = d.minTlsVersion;
  if (d.minLogRetentionDays.trim()) p.minLogRetentionDays = Number(d.minLogRetentionDays);
  if (platform && d.disabled.length) p.disabled = d.disabled;
  return p;
}

/** Policies as data (open item 12): the platform policy for staff, the tenant policy for owners and admins. */
export default function PoliciesPage() {
  const t = useTranslations('policies');
  const me = useMe();
  const can = useCan();
  const staff = isPlatformStaff(me.data);
  const tenants = useTenants(staff);
  const choices = staff ? (tenants.data ?? []).map((x) => ({ id: x.id, name: x.name })) : (me.data?.memberships ?? []).map((m) => ({ id: m.tenantId, name: m.tenantName }));
  const [chosen, setChosen] = useState('');
  const tenantId = chosen || choices[0]?.id || '';
  const tenantName = choices.find((c) => c.id === tenantId)?.name ?? '';
  const platform = useQuery({ queryKey: ['policy', 'platform'], queryFn: ({ signal }) => apiGet<PolicyConfigDto>('/policies', { signal }), enabled: staff });
  const tenant = useQuery({
    queryKey: ['policy', 'tenant', tenantId],
    queryFn: ({ signal }) => apiGet<TenantPolicyDto>(`/tenants/${tenantId}/policy`, { signal }),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      {staff ? (
        platform.isPending || tenant.isPending ? (
          <PageSpinner />
        ) : platform.error ? (
          <ErrorNotice error={platform.error} />
        ) : (
          <PolicyForm
            key="platform"
            title={t('platform')}
            hint={t('platformHint')}
            policy={platform.data}
            builtIn={tenant.data?.builtIn ?? []}
            platformScope
            editable={can('update', 'Policy')}
            path="/policies"
          />
        )
      ) : null}

      {choices.length > 0 ? (
        <div className="space-y-4">
          {choices.length > 1 ? (
            <Field label={t('chooseTenant')} htmlFor="pol-tenant" className="max-w-xs">
              <Select id="pol-tenant" value={tenantId} onChange={(e) => setChosen(e.target.value)}>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {tenant.isPending ? (
            <PageSpinner />
          ) : tenant.error ? (
            <ErrorNotice error={tenant.error} />
          ) : (
            <>
              <PolicyForm
                key={tenantId}
                title={t('tenant')}
                hint={t('tenantHint', { tenant: tenantName })}
                policy={tenant.data.tenant}
                builtIn={tenant.data.builtIn}
                platformScope={false}
                editable={can('update', 'Policy', tenantId)}
                path={`/tenants/${tenantId}/policy`}
              />
              <EffectiveCard policy={tenant.data.effective} tenant={tenantName} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PolicyForm({
  title,
  hint,
  policy,
  builtIn,
  platformScope,
  editable,
  path,
}: {
  title: string;
  hint: string;
  policy: PolicyConfigDto;
  builtIn: string[];
  platformScope: boolean;
  editable: boolean;
  path: string;
}) {
  const t = useTranslations('policies');
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(policy));
  const [invalid, setInvalid] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const save = useMutation({
    mutationFn: (body: PolicyConfigDto) => apiSend('PUT', path, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['policy'] }),
  });
  const id = (k: string) => `${platformScope ? 'pp' : 'tp'}-${k}`;

  return (
    <Card>
      <CardHeader title={title} description={hint} />
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const body = fromDraft(d, platformScope);
          setInvalid(body === null);
          if (body) save.mutate(body);
        }}
      >
        <fieldset disabled={!editable} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('allowedRegions')} htmlFor={id('regions')} hint={t('allowedRegionsHint')}>
              <Input id={id('regions')} value={d.allowedRegions} onChange={(e) => set('allowedRegions', e.target.value)} />
            </Field>
            <Field label={t('requiredLabels')} htmlFor={id('labels')} hint={t('requiredLabelsHint')}>
              <Input id={id('labels')} value={d.requiredLabels} onChange={(e) => set('requiredLabels', e.target.value)} />
            </Field>
            <Field label={t('maxMonthlyCostUsd')} htmlFor={id('cost')}>
              <Input id={id('cost')} type="number" min={1} value={d.maxMonthlyCostUsd} onChange={(e) => set('maxMonthlyCostUsd', e.target.value)} />
            </Field>
            <Field label={t('maxReplicas')} htmlFor={id('replicas')}>
              <Input id={id('replicas')} type="number" min={1} value={d.maxReplicas} onChange={(e) => set('maxReplicas', e.target.value)} />
            </Field>
            <Field label={t('minTlsVersion')} htmlFor={id('tls')}>
              <Select id={id('tls')} value={d.minTlsVersion} onChange={(e) => set('minTlsVersion', e.target.value as Draft['minTlsVersion'])}>
                <option value="">{t('none')}</option>
                <option value="1.2">TLS 1.2</option>
                <option value="1.3">TLS 1.3</option>
              </Select>
            </Field>
            <Field label={t('minLogRetentionDays')} htmlFor={id('logs')}>
              <Input id={id('logs')} type="number" min={1} max={3653} value={d.minLogRetentionDays} onChange={(e) => set('minLogRetentionDays', e.target.value)} />
            </Field>
            <Field label={t('machineSizes')} htmlFor={id('sizes')} hint={t('machineSizesHint')}>
              <Textarea id={id('sizes')} rows={3} value={d.machineSizes} onChange={(e) => set('machineSizes', e.target.value)} />
            </Field>
            <Field label={t('approvedRegistries')} htmlFor={id('registries')} hint={t('approvedRegistriesHint')}>
              <Textarea id={id('registries')} rows={3} value={d.approvedRegistries} onChange={(e) => set('approvedRegistries', e.target.value)} />
            </Field>
          </div>
          {platformScope ? (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">{t('disabled')}</legend>
              <p className="mb-2 text-xs text-fg-subtle">{t('disabledHint')}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {builtIn.map((name) => (
                  <label key={name} className="flex items-center gap-1.5 font-mono text-xs">
                    <input
                      type="checkbox"
                      checked={d.disabled.includes(name)}
                      onChange={(e) => set('disabled', e.target.checked ? [...d.disabled, name] : d.disabled.filter((x) => x !== name))}
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </fieldset>
        {!editable ? <Notice tone="info">{t('readOnly')}</Notice> : null}
        {invalid ? <Notice tone="warn">{t('invalidSizes')}</Notice> : null}
        {save.error ? <ErrorNotice error={save.error} /> : null}
        {save.isSuccess ? <Notice tone="ok">{t('saved')}</Notice> : null}
        {editable ? (
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={save.isPending}>
              <Save size={14} aria-hidden /> {t('save')}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function EffectiveCard({ policy, tenant }: { policy: PolicyConfigDto; tenant: string }) {
  const t = useTranslations('policies');
  const rows: [string, string][] = [
    [t('allowedRegions'), policy.allowedRegions?.join(', ') ?? ''],
    [t('maxMonthlyCostUsd'), policy.maxMonthlyCostUsd?.toString() ?? ''],
    [t('maxReplicas'), policy.maxReplicas?.toString() ?? ''],
    [t('machineSizes'), policy.machineSizes?.map((s) => `${s.cpu}/${s.memoryMiB}`).join(', ') ?? ''],
    [t('approvedRegistries'), policy.approvedRegistries?.join(', ') ?? ''],
    [t('requiredLabels'), policy.requiredLabels?.join(', ') ?? ''],
    [t('minTlsVersion'), policy.minTlsVersion ? `TLS ${policy.minTlsVersion}` : ''],
    [t('minLogRetentionDays'), policy.minLogRetentionDays?.toString() ?? ''],
    [t('disabled'), policy.disabled?.join(', ') ?? ''],
  ];
  return (
    <Card aria-label={t('effective', { tenant })}>
      <CardHeader title={t('effective', { tenant })} description={t('effectiveHint')} />
      <dl className="grid gap-x-6 gap-y-2 px-4 pb-4 text-sm sm:grid-cols-[16rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-muted">{k}</dt>
            <dd className={v ? 'font-mono text-xs' : 'text-fg-subtle'}>{v || t('none')}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
