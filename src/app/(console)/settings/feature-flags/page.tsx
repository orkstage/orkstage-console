// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { FeatureFlagDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ProviderLogo } from '@/components/resource-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet, apiSend } from '@/lib/api';
import { useCan } from '@/lib/ability';
import { useTenants } from '@/lib/queries';

/**
 * Platform feature flags. Provider flags decide which clouds and platforms accept new targets
 * and deployments: AWS and simulation are on by default, providers not yet proven on live
 * accounts are off. Platform owners can switch them for everyone or for one tenant.
 */
export default function FeatureFlagsPage() {
  const t = useTranslations('featureFlags');
  const can = useCan();
  const canManage = can('manage', 'Settings');
  const qc = useQueryClient();
  const tenants = useTenants();
  const [tenantId, setTenantId] = useState('');
  const flags = useQuery({ queryKey: ['feature-flags'], queryFn: ({ signal }) => apiGet<FeatureFlagDto[]>('/feature-flags', { signal }) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['feature-flags'] });
    void qc.invalidateQueries({ queryKey: ['cloud-providers'] });
  };
  const set = useMutation({
    mutationFn: (v: { key: string; enabled: boolean }) => apiSend('PUT', `/feature-flags/${v.key}`, { enabled: v.enabled, ...(tenantId ? { tenantId } : {}) }),
    onSuccess: refresh,
  });
  const reset = useMutation({
    mutationFn: (key: string) => apiSend('DELETE', `/feature-flags/${key}${tenantId ? `?tenantId=${tenantId}` : ''}`),
    onSuccess: refresh,
  });

  if (flags.isPending) return <PageSpinner />;
  if (flags.error) return <ErrorNotice error={flags.error} />;

  const valueFor = (f: FeatureFlagDto) => {
    const own = tenantId ? f.tenants.find((x) => x.tenantId === tenantId)?.enabled : f.platform ?? undefined;
    return { own, effective: own ?? f.enabled };
  };

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {!canManage ? <Notice tone="info">{t('readOnly')}</Notice> : null}
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="ff-scope" className="text-sm font-medium">
          {t('scope')}
        </label>
        <Select id="ff-scope" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="max-w-xs">
          <option value="">{t('platform')}</option>
          {(tenants.data ?? []).map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </Select>
      </div>
      {set.error ? <ErrorNotice error={set.error} /> : null}
      {reset.error ? <ErrorNotice error={reset.error} /> : null}
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{t('flag')}</TH>
              <TH>{t('source')}</TH>
              <TH className="text-right">{t('enabled')}</TH>
            </TR>
          </THead>
          <TBody>
            {flags.data.map((f) => {
              const { own, effective } = valueFor(f);
              const id = `ff-${f.key}`;
              return (
                <TR key={f.key}>
                  <TD>
                    <div className="flex items-center gap-2">
                      {f.provider ? <ProviderLogo provider={f.provider} size={16} /> : null}
                      <label htmlFor={id} className="font-mono text-xs">
                        {f.key}
                      </label>
                      {f.provider && f.provider !== 'aws' && f.provider !== 'mock' ? <Badge tone="warn">{t('preview')}</Badge> : null}
                    </div>
                    <div className="text-xs text-fg-muted">{f.description}</div>
                    {!tenantId && f.tenants.length ? (
                      <div className="mt-1 text-xs text-fg-subtle">
                        {t('tenantOverrides', { list: f.tenants.map((x) => `${x.tenantName}: ${x.enabled ? t('on') : t('off')}`).join(', ') })}
                      </div>
                    ) : null}
                  </TD>
                  <TD className="text-xs text-fg-muted">
                    {own === undefined ? (tenantId ? t('inherited') : t('default', { value: f.defaultEnabled ? t('on') : t('off') })) : t('override')}
                    {own !== undefined && canManage ? (
                      <Button size="sm" variant="ghost" className="ml-2" onClick={() => reset.mutate(f.key)} title={t('reset')} aria-label={t('reset')}>
                        <RotateCcw size={12} aria-hidden />
                      </Button>
                    ) : null}
                  </TD>
                  <TD className="text-right">
                    <input
                      id={id}
                      type="checkbox"
                      role="switch"
                      aria-checked={effective}
                      checked={effective}
                      disabled={!canManage || set.isPending}
                      onChange={(e) => set.mutate({ key: f.key, enabled: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
