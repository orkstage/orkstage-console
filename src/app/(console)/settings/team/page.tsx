// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { inviteMemberSchema, TENANT_ROLES, type InvitationCreatedDto, type TeamDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Trash2, UserPlus, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { useRoleLabels } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFormat } from '@/i18n/format';
import { apiGet, apiSend } from '@/lib/api';
import { isPlatformStaff, useCan, useMe } from '@/lib/ability';
import { useTenants } from '@/lib/queries';

/**
 * Members and invitations of a tenant. Owners invite by email and change roles; every member can
 * see the team; anyone can leave (a tenant always keeps one owner).
 */
export default function TeamPage() {
  const t = useTranslations('team');
  const me = useMe();
  const tenants = useTenants();
  const staff = me.data ? isPlatformStaff(me.data) : false;
  const mine = staff ? (tenants.data ?? []) : (tenants.data ?? []).filter((tn) => me.data?.memberships.some((m) => m.tenantId === tn.id));
  const [picked, setPicked] = useState('');
  const tenantId = picked || mine[0]?.id || '';

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {mine.length > 1 ? (
        <div className="mb-4 max-w-xs">
          <Field label={t('tenant')} htmlFor="team-tenant">
            <Select id="team-tenant" value={tenantId} onChange={(e) => setPicked(e.target.value)}>
              {mine.map((tn) => (
                <option key={tn.id} value={tn.id}>
                  {tn.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
      {tenantId ? <Team tenantId={tenantId} /> : tenants.isPending ? <PageSpinner /> : <EmptyState icon={Users} title={t('noTenant')} />}
    </>
  );
}

function Team({ tenantId }: { tenantId: string }) {
  const t = useTranslations('team');
  const roleLabel = useRoleLabels();
  const fmt = useFormat();
  const can = useCan();
  const me = useMe();
  const qc = useQueryClient();
  const canManage = can('update', 'Member', tenantId);
  const team = useQuery({ queryKey: ['team', tenantId], queryFn: ({ signal }) => apiGet<TeamDto>(`/tenants/${tenantId}/members`, { signal }) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['team', tenantId] });
  const changeRole = useMutation({ mutationFn: (v: { userId: string; role: string }) => apiSend('PATCH', `/tenants/${tenantId}/members/${v.userId}`, { role: v.role }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (userId: string) => apiSend('DELETE', `/tenants/${tenantId}/members/${userId}`), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (id: string) => apiSend('DELETE', `/tenants/${tenantId}/invitations/${id}`), onSuccess: refresh });

  if (team.isPending) return <PageSpinner />;
  if (team.error) return <ErrorNotice error={team.error} />;

  return (
    <div className="space-y-4">
      {canManage ? <InviteForm tenantId={tenantId} onDone={refresh} /> : <Notice tone="info">{t('readOnly')}</Notice>}
      {changeRole.error ? <ErrorNotice error={changeRole.error} /> : null}
      {remove.error ? <ErrorNotice error={remove.error} /> : null}

      <Card>
        <CardHeader title={t('members', { count: team.data.members.length })} as="h2" />
        <Table>
          <THead>
            <TR>
              <TH>{t('person')}</TH>
              <TH>{t('role')}</TH>
              <TH>{t('joined')}</TH>
              <TH className="text-right">
                <span className="sr-only">{t('actions')}</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {team.data.members.map((m) => {
              const self = m.userId === me.data?.user.id;
              return (
                <TR key={m.userId}>
                  <TD>
                    <div className="font-medium">
                      {m.name} {self ? <Badge>{t('you')}</Badge> : null}
                    </div>
                    <div className="text-xs text-fg-muted">{m.email}</div>
                  </TD>
                  <TD>
                    {canManage ? (
                      <Select aria-label={t('roleFor', { name: m.name })} value={m.role} onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value })} disabled={changeRole.isPending}>
                        {TENANT_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel.role(r)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      roleLabel.role(m.role)
                    )}
                  </TD>
                  <TD className="text-xs text-fg-muted">{fmt.relative(m.joinedAt)}</TD>
                  <TD className="text-right">
                    {canManage || self ? (
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.userId)} title={self ? t('leave') : t('remove')} aria-label={self ? t('leave') : t('remove', { name: m.name })}>
                        <Trash2 size={14} aria-hidden />
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      {team.data.invitations.length ? (
        <Card>
          <CardHeader title={t('pending', { count: team.data.invitations.length })} as="h2" />
          <Table>
            <THead>
              <TR>
                <TH>{t('email')}</TH>
                <TH>{t('role')}</TH>
                <TH>{t('expires')}</TH>
                <TH className="text-right">
                  <span className="sr-only">{t('actions')}</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {team.data.invitations.map((i) => (
                <TR key={i.id}>
                  <TD>{i.email}</TD>
                  <TD>{roleLabel.role(i.role)}</TD>
                  <TD className="text-xs">{i.expired ? <Badge tone="warn">{t('expired')}</Badge> : fmt.relative(i.expiresAt)}</TD>
                  <TD className="text-right">
                    {canManage ? (
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)} aria-label={t('revoke', { email: i.email })} title={t('revoke', { email: i.email })}>
                        <Trash2 size={14} aria-hidden />
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}

function InviteForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const t = useTranslations('team');
  const roleLabel = useRoleLabels();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof TENANT_ROLES)[number]>('CustomerDeveloper');
  const [error, setError] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: (body: unknown) => apiSend<InvitationCreatedDto>('POST', `/tenants/${tenantId}/invitations`, body),
    onSuccess: () => {
      setEmail('');
      onDone();
    },
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = inviteMemberSchema.safeParse({ email, role });
    if (!parsed.success) {
      setError(t('invalidEmail'));
      return;
    }
    invite.mutate(parsed.data);
  };
  return (
    <Card>
      <CardHeader title={t('invite')} description={t('inviteHint')} as="h2" />
      <CardBody>
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end" noValidate>
          <Field label={t('email')} htmlFor="inv-email" error={error ?? undefined}>
            <Input id="inv-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </Field>
          <Field label={t('role')} htmlFor="inv-role">
            <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              {TENANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel.role(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" loading={invite.isPending}>
            <UserPlus size={14} aria-hidden /> {t('send')}
          </Button>
        </form>
        {invite.error ? <ErrorNotice error={invite.error} /> : null}
        {invite.data ? (
          <Notice tone="ok" className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Mail size={14} aria-hidden /> {t('sent', { email: invite.data.invitation.email })}
              <code className="max-w-full truncate font-mono text-xs">{invite.data.link}</code>
              <CopyButton value={invite.data.link} label={t('copyLink')} />
            </div>
            <p className="mt-1 text-xs">{t('linkOnce')}</p>
          </Notice>
        ) : null}
      </CardBody>
    </Card>
  );
}
