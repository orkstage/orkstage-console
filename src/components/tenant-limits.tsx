// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { tenantLimitsSchema, type TenantDto, type TenantLimitsInput } from '@orkstage/contracts';
import { TENANT_LIMIT_KEYS } from '@orkstage/domain/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorNotice } from '@/components/ui/error-notice';
import { Field, Input } from '@/components/ui/input';
import { useFormat } from '@/i18n/format';
import { apiSend } from '@/lib/api';

type LimitKey = (typeof TENANT_LIMIT_KEYS)[number];

/** A tenant's limits in a few words for tables and pickers: the first three, then how many more. */
export function LimitsSummary({ limits }: { limits: TenantLimitsInput }) {
  const t = useTranslations('tenants.limits');
  const fmt = useFormat();
  const set = TENANT_LIMIT_KEYS.filter((k) => limits[k] !== undefined);
  if (set.length === 0) return <span className="text-xs text-fg-subtle">{t('none')}</span>;
  const shown = set.slice(0, 3).map((k) => t(`short.${k}`, { value: fmt.number(limits[k]!) }));
  return (
    <span className="text-xs text-fg-muted">
      {shown.join(', ')}
      {set.length > 3 ? ` ${t('more', { count: set.length - 3 })}` : ''}
    </span>
  );
}

/** Edits a tenant's limits (ADR 0007). Only platform owners and admins see the button that opens it. */
export function TenantLimitsDialog({ tenant, onClose }: { tenant: TenantDto | null; onClose: () => void }) {
  const t = useTranslations('tenants.limits');
  return (
    <Dialog open={!!tenant} onClose={onClose} title={tenant ? t('title', { tenant: tenant.name }) : ''} description={t('description')}>
      {tenant ? <LimitsForm key={tenant.id} tenant={tenant} onDone={onClose} /> : null}
    </Dialog>
  );
}

function LimitsForm({ tenant, onDone }: { tenant: TenantDto; onDone: () => void }) {
  const t = useTranslations('tenants.limits');
  const tc = useTranslations('common');
  const qc = useQueryClient();
  const [values, setValues] = useState(
    () => Object.fromEntries(TENANT_LIMIT_KEYS.map((k) => [k, tenant.limits[k] === undefined ? '' : String(tenant.limits[k])])) as Record<LimitKey, string>,
  );
  // An empty field is no limit; the rest must pass the same schema as the API.
  const parsed = tenantLimitsSchema.safeParse(Object.fromEntries(TENANT_LIMIT_KEYS.filter((k) => values[k].trim() !== '').map((k) => [k, Number(values[k])])));
  const invalid = new Set(parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0])));
  const save = useMutation({
    mutationFn: (limits: TenantLimitsInput) => apiSend<TenantDto>('PATCH', `/tenants/${tenant.id}`, { limits }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenants'] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.success) save.mutate(parsed.data);
      }}
      className="space-y-3"
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {TENANT_LIMIT_KEYS.map((k) => (
          <Field key={k} label={t(`label.${k}`)} htmlFor={`limit-${k}`} error={invalid.has(k) ? t('invalid') : undefined}>
            <Input
              id={`limit-${k}`}
              type="number"
              min={0}
              inputMode="decimal"
              placeholder={t('unlimited')}
              value={values[k]}
              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <p className="text-xs text-fg-subtle">{t('flagsHint')}</p>
      {save.error ? <ErrorNotice error={save.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{tc('cancel')}</Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!parsed.success}>
          {tc('save')}
        </Button>
      </div>
    </form>
  );
}
