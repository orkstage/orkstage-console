// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { destroyInstanceSchema, upgradeInstanceSchema, type DeploymentSummaryDto, type InstanceDto, type PreviewDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { useFormat } from '@/i18n/format';
import { useEnvironmentLabel } from '@/i18n/labels';
import { useZodResolver } from '@/i18n/zod';
import { ApiError, apiSend } from '@/lib/api';
import { staleDatabases } from '@/lib/backups';
import { useTemplate } from '@/lib/queries';
import { newIdempotencyKey } from '@/lib/utils';
import { SimulatedBadge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { ErrorNotice, Notice } from '../ui/error-notice';
import { describedBy, Field, Input } from '../ui/input';
import { Select } from '../ui/select';
import { PageSpinner } from '../ui/spinner';

export function DeployDialog({ instance, open, onClose }: { instance: InstanceDto; open: boolean; onClose: () => void }) {
  const t = useTranslations('instanceDialogs');
  return (
    <Dialog open={open} onClose={onClose} title={t('deployTitle', { name: instance.name })} description={t('deployDescription')}>
      <DeployBody instance={instance} onClose={onClose} />
    </Dialog>
  );
}

function DeployBody({ instance, onClose }: { instance: InstanceDto; onClose: () => void }) {
  const t = useTranslations('instanceDialogs');
  const tc = useTranslations('common');
  const envLabel = useEnvironmentLabel();
  const router = useRouter();
  const qc = useQueryClient();
  // One key per dialog opening: a double click or retry after a network blip returns the same deployment.
  const [idempotencyKey] = useState(newIdempotencyKey);
  const deploy = useMutation({
    mutationFn: () => apiSend<DeploymentSummaryDto>('POST', `/instances/${instance.id}/deploy`, {}, { headers: { 'idempotency-key': idempotencyKey } }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['instance', instance.id] });
      void qc.invalidateQueries({ queryKey: ['deployments'] });
      router.push(`/deployments/${d.id}`);
    },
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">{t('deployBody')}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>
          {t.rich('templateLine', { name: instance.template.displayName, strong: (chunks) => <strong className="text-fg">{chunks}</strong> })}{' '}
          <span className="font-mono text-xs">@{instance.template.version}</span>
        </li>
        <li>{t.rich('environmentLine', { environment: envLabel(instance.environment), strong: (chunks) => <strong className="text-fg">{chunks}</strong> })}</li>
      </ul>
      {instance.simulated ? (
        <Notice tone="info">
          <SimulatedBadge /> {t('simulatedNote')}
        </Notice>
      ) : null}
      {deploy.error ? <ErrorNotice error={deploy.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onClose}>{tc('cancel')}</Button>
        <Button variant="primary" loading={deploy.isPending} onClick={() => deploy.mutate()}>
          {t('deploy')}
        </Button>
      </div>
    </div>
  );
}

export function DestroyDialog({ instance, open, onClose }: { instance: InstanceDto; open: boolean; onClose: () => void }) {
  const t = useTranslations('instanceDialogs');
  return (
    <Dialog open={open} onClose={onClose} title={t('destroyTitle', { name: instance.name })} description={t('destroyDescription')}>
      <DestroyBody instance={instance} onClose={onClose} />
    </Dialog>
  );
}

function DestroyBody({ instance, onClose }: { instance: InstanceDto; onClose: () => void }) {
  const t = useTranslations('instanceDialogs');
  const tc = useTranslations('common');
  const router = useRouter();
  const qc = useQueryClient();
  const mismatch = t('confirmMismatch');
  const schema = useMemo(
    () => destroyInstanceSchema.refine((v) => v.confirm === instance.slug, { message: mismatch, path: ['confirm'] }),
    [instance.slug, mismatch],
  );
  const form = useForm({ resolver: useZodResolver(schema), defaultValues: { confirm: '' }, mode: 'onChange' });
  const confirmValue = form.watch('confirm');
  const [withoutBackup, setWithoutBackup] = useState(false);
  const destroy = useMutation({
    mutationFn: (confirm: string) =>
      apiSend<DeploymentSummaryDto>('POST', `/instances/${instance.id}/destroy`, { confirm, ...(withoutBackup ? { withoutRecentBackup: true } : {}) }),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['instance', instance.id] });
      void qc.invalidateQueries({ queryKey: ['instances'] });
      router.push(`/deployments/${d.id}`);
    },
  });
  const err = form.formState.errors.confirm?.message;
  // Production data is destroyed only with a recent backup behind it, unless confirmed here; the
  // API may also refuse with BACKUP_NOT_RECENT when its backup state is newer than this page's.
  const refusal = destroy.error instanceof ApiError && destroy.error.code === 'BACKUP_NOT_RECENT' ? destroy.error : null;
  const stale = [
    ...new Set([
      ...(instance.environment === 'production' ? staleDatabases(instance.resources ?? []) : []),
      ...(Array.isArray(refusal?.details.resources) ? (refusal.details.resources as string[]) : []),
    ]),
  ];

  if (instance.protectedFromDestroy) {
    return (
      <div className="space-y-3">
        <Notice tone="warn">{t('protected')}</Notice>
        <div className="flex justify-end">
          <Button onClick={onClose}>{tc('close')}</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((v) => destroy.mutate(v.confirm))} className="space-y-4" noValidate>
      <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/8 p-3 text-sm">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger-ink" aria-hidden />
        <p>{t('destroyWarning', { count: instance.resources?.length ?? 0 })}</p>
      </div>
      <Field
        label={t.rich('confirmLabel', { slug: instance.slug, code: (chunks) => <code className="rounded bg-surface-2 px-1 font-mono text-fg">{chunks}</code> })}
        htmlFor="destroy-confirm"
        error={confirmValue && err ? err : undefined}
      >
        <Input id="destroy-confirm" autoComplete="off" spellCheck={false} className="font-mono" autoFocus {...describedBy('destroy-confirm', { error: confirmValue && err })} {...form.register('confirm')} />
      </Field>
      {stale.length > 0 ? (
        <Notice tone="warn" className="space-y-2">
          <p>{t('backupNotRecent', { resources: stale.join(', '), count: stale.length })}</p>
          <label htmlFor="destroy-without-backup" className="flex items-start gap-2">
            <input id="destroy-without-backup" type="checkbox" checked={withoutBackup} onChange={(e) => setWithoutBackup(e.target.checked)} className="mt-0.5 accent-accent" />
            <span>{t('withoutRecentBackup')}</span>
          </label>
        </Notice>
      ) : null}
      {destroy.error && !refusal ? <ErrorNotice error={destroy.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onClose}>{tc('cancel')}</Button>
        <Button type="submit" variant="danger" disabled={confirmValue !== instance.slug || (stale.length > 0 && !withoutBackup)} loading={destroy.isPending}>
          {t('destroy')}
        </Button>
      </div>
    </form>
  );
}

export function UpgradeDialog({ instance, open, onClose, onUpgraded }: { instance: InstanceDto; open: boolean; onClose: () => void; onUpgraded: (deploymentId: string) => void }) {
  const t = useTranslations('instanceDialogs');
  return (
    <Dialog open={open} onClose={onClose} title={t('upgradeTitle')} description={t('upgradeDescription')}>
      <UpgradeBody instance={instance} onClose={onClose} onUpgraded={onUpgraded} />
    </Dialog>
  );
}

function UpgradeBody({ instance, onClose, onUpgraded }: { instance: InstanceDto; onClose: () => void; onUpgraded: (deploymentId: string) => void }) {
  const t = useTranslations('instanceDialogs');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const qc = useQueryClient();
  const template = useTemplate(instance.template.id);
  const versions = (template.data?.versions ?? []).filter((v) => v.status === 'PUBLISHED' && v.id !== instance.template.versionId);
  const form = useForm({ resolver: useZodResolver(upgradeInstanceSchema), defaultValues: { templateVersionId: '' } });
  const selected = form.watch('templateVersionId');
  // The plan from what runs now to the chosen version, before anything starts.
  const preview = useQuery({
    queryKey: ['instance', instance.id, 'upgrade-preview', selected],
    queryFn: () => apiSend<PreviewDto>('POST', `/instances/${instance.id}/preview?templateVersionId=${selected}`),
    enabled: Boolean(selected),
  });
  const upgrade = useMutation({
    mutationFn: (templateVersionId: string) => apiSend<DeploymentSummaryDto>('POST', `/instances/${instance.id}/upgrade`, { templateVersionId }),
    onSuccess: (deployment) => {
      void qc.invalidateQueries({ queryKey: ['instance', instance.id] });
      onUpgraded(deployment.id);
      onClose();
    },
  });

  if (template.isPending) return <PageSpinner />;
  if (template.error) return <ErrorNotice error={template.error} />;
  if (versions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">
          {t.rich('noOtherVersion', {
            name: instance.template.displayName,
            version: instance.template.version,
            strong: (chunks) => <strong>{chunks}</strong>,
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </p>
        <div className="flex justify-end">
          <Button onClick={onClose}>{tc('close')}</Button>
        </div>
      </div>
    );
  }
  const err = form.formState.errors.templateVersionId?.message;
  const plan = preview.data?.plan;
  const deletions = plan ? plan.groups.flatMap((g) => g.changes.filter((c) => c.action === 'DELETE').map((c) => c.resourceId)) : [];
  return (
    <form onSubmit={form.handleSubmit((v) => upgrade.mutate(v.templateVersionId))} className="space-y-4" noValidate>
      <p className="text-sm text-fg-muted">
        {t.rich('currentVersion', { version: instance.template.version, code: (chunks) => <code className="font-mono text-fg">{chunks}</code> })}
      </p>
      <Field label={t('targetVersion')} htmlFor="upgrade-version" error={err ? t('chooseVersion') : undefined}>
        <Select id="upgrade-version" {...describedBy('upgrade-version', { error: err })} {...form.register('templateVersionId')}>
          <option value="">{t('selectVersion')}</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {t('versionOption', { version: v.version, date: fmt.dateTime(v.publishedAt) })}
            </option>
          ))}
        </Select>
      </Field>
      {selected && preview.isPending ? <PageSpinner /> : null}
      {preview.error ? <ErrorNotice error={preview.error} /> : null}
      {preview.data && !preview.data.valid ? <Notice tone="warn">{t('upgradeInvalid', { count: preview.data.issues.filter((i) => i.severity === 'error').length })}</Notice> : null}
      {plan ? (
        <div className="rounded border border-border p-3 text-sm">
          <p>{t('upgradePlan', { create: plan.counts.CREATE, update: plan.counts.UPDATE, remove: plan.counts.DELETE, risk: plan.risk })}</p>
          {deletions.length ? (
            <Notice tone="warn" className="mt-2">
              {t('upgradeDeletes', { list: deletions.join(', ') })}
            </Notice>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-fg-muted">{t('upgradeHow')}</p>
      {upgrade.error ? <ErrorNotice error={upgrade.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onClose}>{tc('cancel')}</Button>
        <Button type="submit" variant="primary" loading={upgrade.isPending} disabled={!preview.data?.valid}>
          {t('changeVersion')}
        </Button>
      </div>
    </form>
  );
}
