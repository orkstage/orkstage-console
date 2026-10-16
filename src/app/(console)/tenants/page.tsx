// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { createTenantSchema, type CreateTenantInput, type TenantDto } from '@orkstage/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describedBy, Field, Input } from '@/components/ui/input';
import { Disclosure, PageHeader } from '@/components/ui/page-header';
import { PageSpinner } from '@/components/ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFormat } from '@/i18n/format';
import { useZodResolver } from '@/i18n/zod';
import { apiSend } from '@/lib/api';
import { useCan } from '@/lib/ability';
import { useTenants } from '@/lib/queries';
import { LimitsSummary, TenantLimitsDialog } from '@/components/tenant-limits';
import { slugify, splitList } from '@/lib/utils';

export default function TenantsPage() {
  const t = useTranslations('tenants');
  const tenants = useTenants();
  const can = useCan();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          can('create', 'Tenant') ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden /> {t('new')}
            </Button>
          ) : null
        }
      />
      <Card>
        {tenants.isPending ? (
          <PageSpinner />
        ) : tenants.error ? (
          <ErrorNotice error={tenants.error} className="m-4" />
        ) : tenants.data.length === 0 ? (
          <EmptyState icon={Building2} title={t('emptyTitle')} description={t('emptyBody')} />
        ) : (
          <TenantTable tenants={tenants.data} />
        )}
      </Card>
      <CreateTenantDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function TenantTable({ tenants }: { tenants: TenantDto[] }) {
  const t = useTranslations('tenants');
  const fmt = useFormat();
  const can = useCan();
  const [editing, setEditing] = useState<TenantDto | null>(null);
  return (
    <>
    <Table>
      <THead>
        <tr>
          <TH>{t('table.name')}</TH>
          <TH>{t('table.slug')}</TH>
          <TH>{t('table.limits')}</TH>
          <TH className="text-right">{t('table.instances')}</TH>
          <TH>{t('table.created')}</TH>
          <TH>
            <span className="sr-only">{t('table.links')}</span>
          </TH>
        </tr>
      </THead>
      <TBody>
        {tenants.map((tenant) => (
          <TR key={tenant.id}>
            <TD className="font-medium">{tenant.name}</TD>
            <TD>
              <code className="font-mono text-xs text-fg-muted">{tenant.slug}</code>
            </TD>
            <TD>
              <LimitsSummary limits={tenant.limits} />
            </TD>
            <TD className="text-right tabular-nums">{fmt.number(tenant.instanceCount)}</TD>
            <TD className="text-xs text-fg-muted">{fmt.dateTime(tenant.createdAt)}</TD>
            <TD className="whitespace-nowrap text-right text-xs">
              <Link href={`/instances?tenantId=${tenant.id}`} className="text-accent-ink hover:underline">
                {t('instancesLink')}
              </Link>
              <span className="mx-1.5 text-fg-subtle">·</span>
              <Link href={`/status/${tenant.id}`} className="text-accent-ink hover:underline">
                {t('statusLink')}
              </Link>
              {can('manage', 'TenantLimits') ? (
                <>
                  <span className="mx-1.5 text-fg-subtle">·</span>
                  <button type="button" className="text-accent-ink hover:underline" onClick={() => setEditing(tenant)}>
                    {t('limits.edit')}
                  </button>
                </>
              ) : null}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
    <TenantLimitsDialog tenant={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CreateTenantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('tenants');
  return (
    <Dialog open={open} onClose={onClose} title={t('new')} description={t('dialogDescription')}>
      <CreateTenantForm onDone={onClose} />
    </Dialog>
  );
}

function CreateTenantForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('tenants.form');
  const tc = useTranslations('common');
  const qc = useQueryClient();
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm({
    resolver: useZodResolver(createTenantSchema),
    defaultValues: { name: '', slug: '', limits: {}, allowedEmailDomains: [] } as CreateTenantInput,
  });
  const { errors } = form.formState;

  const create = useMutation({
    mutationFn: (input: CreateTenantInput) => apiSend<TenantDto>('POST', '/tenants', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenants'] });
      onDone();
    },
  });

  const nameField = form.register('name', {
    onChange: (e: { target: { value: string } }) => {
      if (!slugTouched) form.setValue('slug', slugify(e.target.value), { shouldValidate: form.formState.isSubmitted });
    },
  });

  return (
    <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
      <Field label={t('name')} htmlFor="tenant-name" error={errors.name?.message} required>
        <Input id="tenant-name" autoFocus {...describedBy('tenant-name', { error: errors.name })} {...nameField} />
      </Field>
      <Field label={t('slug')} htmlFor="tenant-slug" hint={t('slugHint')} error={errors.slug?.message} required>
        <Input
          id="tenant-slug"
          className="font-mono"
          {...describedBy('tenant-slug', { hint: true, error: errors.slug })}
          {...form.register('slug', { onChange: () => setSlugTouched(true) })}
        />
      </Field>
      <Disclosure summary={t('advanced')}>
        <Field label={t('domains')} htmlFor="tenant-domains" hint={t('domainsHint')} error={errors.allowedEmailDomains?.message}>
          <Input
            id="tenant-domains"
            placeholder="acme.com, acme.io"
            {...form.register('allowedEmailDomains', { setValueAs: (v: unknown) => splitList(v) })}
          />
        </Field>
      </Disclosure>
      {create.error ? <ErrorNotice error={create.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{tc('cancel')}</Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}
