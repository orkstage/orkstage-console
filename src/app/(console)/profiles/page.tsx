// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { createProfileSchema, TARGET_ENVIRONMENTS, type CloudTargetDto, type ProfileDto } from '@orkstage/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Trash2 } from 'lucide-react';
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
import { useFormat } from '@/i18n/format';
import { useEnvironmentLabel } from '@/i18n/labels';
import { apiSend } from '@/lib/api';
import { useCan } from '@/lib/ability';
import { tenantNameMap, useCloudTargets, useProfiles, useTenants } from '@/lib/queries';

/**
 * Profiles (ADR 0007): the cloud target, and optionally the region, per provider for one
 * environment. Platform owners and admins manage them; everyone else sees the ones they can use.
 */
export default function ProfilesPage() {
  const t = useTranslations('profiles');
  const profiles = useProfiles();
  const tenants = useTenants();
  const can = useCan();
  const canManage = can('create', 'Profile', null);
  const [editing, setEditing] = useState<ProfileDto | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ProfileDto | null>(null);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={14} aria-hidden /> {t('new')}
            </Button>
          ) : null
        }
      />
      <Card>
        {profiles.isPending ? (
          <PageSpinner />
        ) : profiles.error ? (
          <ErrorNotice error={profiles.error} className="m-4" />
        ) : profiles.data.length === 0 ? (
          <EmptyState icon={Layers} title={t('emptyTitle')} description={canManage ? t('emptyBody') : t('readOnly')} />
        ) : (
          <ProfileTable profiles={profiles.data} tenantNames={tenantNameMap(tenants.data)} canManage={canManage} onEdit={setEditing} onDelete={setDeleting} />
        )}
      </Card>
      {canManage ? <ProfileDialog editing={editing} onClose={() => setEditing(null)} /> : null}
      <DeleteDialog profile={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function ProfileTable({
  profiles,
  tenantNames,
  canManage,
  onEdit,
  onDelete,
}: {
  profiles: ProfileDto[];
  tenantNames: Map<string, string>;
  canManage: boolean;
  onEdit: (p: ProfileDto) => void;
  onDelete: (p: ProfileDto) => void;
}) {
  const t = useTranslations('profiles');
  const fmt = useFormat();
  const envLabel = useEnvironmentLabel();
  const qc = useQueryClient();
  const setDefault = useMutation({
    mutationFn: (v: { id: string; isDefault: boolean }) => apiSend<ProfileDto>('POST', `/profiles/${v.id}/default`, { isDefault: v.isDefault }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });
  return (
    <>
      {setDefault.error ? <ErrorNotice error={setDefault.error} className="m-4" /> : null}
      <Table>
        <THead>
          <tr>
            <TH>{t('table.name')}</TH>
            <TH>{t('table.scope')}</TH>
            <TH>{t('table.environment')}</TH>
            <TH>{t('table.targets')}</TH>
            <TH className="text-right">{t('table.instances')}</TH>
            {canManage ? (
              <TH>
                <span className="sr-only">{t('table.actions')}</span>
              </TH>
            ) : null}
          </tr>
        </THead>
        <TBody>
          {profiles.map((profile) => (
            <TR key={profile.id}>
              <TD>
                <p className="flex items-center gap-1.5 font-medium">
                  {profile.name}
                  {profile.isDefault ? (
                    <Badge tone="info" title={t('defaultHint')}>
                      {t('defaultBadge')}
                    </Badge>
                  ) : null}
                </p>
              </TD>
              <TD className="text-xs text-fg-muted">{profile.tenantId ? (tenantNames.get(profile.tenantId) ?? profile.tenantId) : t('shared')}</TD>
              <TD>{envLabel(profile.environment)}</TD>
              <TD>
                <ul className="space-y-0.5 text-xs">
                  {profile.targets.map((e) => (
                    <li key={e.provider}>
                      <span className="font-mono">{e.provider}</span>: {e.targetName}, {e.region ?? t('regionDefault', { region: e.defaultRegion })}
                    </li>
                  ))}
                </ul>
              </TD>
              <TD className="text-right tabular-nums">{fmt.number(profile.instanceCount)}</TD>
              {canManage ? (
                <TD className="whitespace-nowrap text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={setDefault.isPending && setDefault.variables?.id === profile.id}
                    onClick={() => setDefault.mutate({ id: profile.id, isDefault: !profile.isDefault })}
                  >
                    {profile.isDefault ? t('unsetDefault') : t('setDefault')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(profile)}>
                    {t('edit')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(profile)} aria-label={t('deleteNamed', { name: profile.name })}>
                    <Trash2 size={13} aria-hidden />
                  </Button>
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}

function ProfileDialog({ editing, onClose }: { editing: ProfileDto | 'new' | null; onClose: () => void }) {
  const t = useTranslations('profiles.form');
  const current = editing && editing !== 'new' ? editing : null;
  return (
    <Dialog open={editing !== null} onClose={onClose} title={current ? t('editTitle', { name: current.name }) : t('title')} description={t('description')} size="lg">
      {editing !== null ? <ProfileForm key={current?.id ?? 'new'} current={current} onDone={onClose} /> : null}
    </Dialog>
  );
}

interface Entry {
  targetId: string;
  region: string;
}

function ProfileForm({ current, onDone }: { current: ProfileDto | null; onDone: () => void }) {
  const t = useTranslations('profiles.form');
  const tc = useTranslations('common');
  const envLabel = useEnvironmentLabel();
  const tenants = useTenants();
  const targets = useCloudTargets();
  const qc = useQueryClient();
  const [tenantId, setTenantId] = useState(current?.tenantId ?? '');
  const [name, setName] = useState(current?.name ?? '');
  const [environment, setEnvironment] = useState<(typeof TARGET_ENVIRONMENTS)[number]>((current?.environment as (typeof TARGET_ENVIRONMENTS)[number]) ?? 'production');
  const [isDefault, setIsDefault] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(current?.targets.map((e) => ({ targetId: e.targetId, region: e.region ?? '' })) ?? [{ targetId: '', region: '' }]);

  // Targets this profile may use: active, in its scope (a shared profile only uses shared ones),
  // and serving its environment.
  const usable = (targets.data ?? []).filter(
    (x) => x.status === 'ACTIVE' && (x.tenantId === null || x.tenantId === (tenantId || null)) && (x.environment === 'any' || x.environment === environment),
  );
  const byId = new Map((targets.data ?? []).map((x) => [x.id, x]));
  const body = {
    ...(current ? {} : { tenantId: tenantId || undefined, isDefault }),
    name,
    environment,
    targets: entries.filter((e) => e.targetId).map((e) => ({ targetId: e.targetId, ...(e.region ? { region: e.region } : {}) })),
  };
  const valid = createProfileSchema.safeParse({ ...body, isDefault: false }).success;
  const save = useMutation({
    mutationFn: () => (current ? apiSend<ProfileDto>('PATCH', `/profiles/${current.id}`, body) : apiSend<ProfileDto>('POST', '/profiles', body)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      onDone();
    },
  });
  const setEntry = (i: number, patch: Partial<Entry>) => setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const providersTaken = (i: number) => new Set(entries.filter((_, j) => j !== i).map((e) => byId.get(e.targetId)?.provider));

  if (targets.isPending) return <PageSpinner />;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
      className="space-y-3"
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('name')} htmlFor="pf-name" required>
          <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t('environment')} htmlFor="pf-env">
          <Select id="pf-env" value={environment} onChange={(e) => setEnvironment(e.target.value as (typeof TARGET_ENVIRONMENTS)[number])}>
            {TARGET_ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {envLabel(env)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('scope')} htmlFor="pf-scope" hint={current ? undefined : t('scopeHint')}>
          <Select id="pf-scope" value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={Boolean(current)}>
            <option value="">{t('sharedOption')}</option>
            {(tenants.data ?? []).map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </Select>
        </Field>
        {current ? null : (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            {t('isDefault')}
          </label>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t('targets')}</legend>
        {usable.length === 0 ? <p className="text-xs text-warn-ink">{t('noTargets')}</p> : null}
        {entries.map((entry, i) => {
          const target = byId.get(entry.targetId);
          const taken = providersTaken(i);
          return (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Field label={t('target')} htmlFor={`pf-target-${i}`}>
                <Select id={`pf-target-${i}`} value={entry.targetId} onChange={(e) => setEntry(i, { targetId: e.target.value, region: '' })}>
                  <option value="">{t('selectTarget')}</option>
                  {usable
                    .filter((x) => x.id === entry.targetId || !taken.has(x.provider))
                    .map((x: CloudTargetDto) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.provider})
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label={t('region')} htmlFor={`pf-region-${i}`}>
                <Select id={`pf-region-${i}`} value={entry.region} onChange={(e) => setEntry(i, { region: e.target.value })} disabled={!target}>
                  <option value="">{target ? t('regionDefault', { region: target.defaultRegion }) : ''}</option>
                  {(target?.allowedRegions ?? []).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button size="sm" variant="ghost" onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))} disabled={entries.length === 1} aria-label={t('remove')}>
                <Trash2 size={13} aria-hidden />
              </Button>
            </div>
          );
        })}
        <Button size="sm" onClick={() => setEntries((prev) => [...prev, { targetId: '', region: '' }])}>
          <Plus size={13} aria-hidden /> {t('addTarget')}
        </Button>
      </fieldset>

      {save.error ? <ErrorNotice error={save.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{tc('cancel')}</Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!valid}>
          {current ? tc('save') : t('submit')}
        </Button>
      </div>
    </form>
  );
}

function DeleteDialog({ profile, onClose }: { profile: ProfileDto | null; onClose: () => void }) {
  const t = useTranslations('profiles');
  const tc = useTranslations('common');
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/profiles/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      onClose();
    },
  });
  return (
    <Dialog open={profile !== null} onClose={onClose} title={profile ? t('deleteTitle', { name: profile.name }) : ''} description={t('deleteBody')}>
      {remove.error ? <ErrorNotice error={remove.error} /> : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onClose}>{tc('cancel')}</Button>
        <Button variant="danger" loading={remove.isPending} onClick={() => profile && remove.mutate(profile.id)}>
          {tc('delete')}
        </Button>
      </div>
    </Dialog>
  );
}
