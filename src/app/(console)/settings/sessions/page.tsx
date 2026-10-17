// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { SessionDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { PageHeader } from '@/components/ui/page-header';
import { PageSpinner } from '@/components/ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useFormat } from '@/i18n/format';
import { apiGet, apiSend } from '@/lib/api';

/** A readable browser and system from the user agent, enough to recognize a device. */
function device(ua: string | null): string {
  if (!ua) return '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(', ') || ua.slice(0, 60);
}

/** The signed in person's sessions: see where the account is open and sign other places out. */
export default function SessionsPage() {
  const t = useTranslations('sessions');
  const fmt = useFormat();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['my-sessions'], queryFn: ({ signal }) => apiGet<SessionDto[]>('/me/sessions', { signal }) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['my-sessions'] });
  const revoke = useMutation({ mutationFn: (id: string) => apiSend('DELETE', `/me/sessions/${id}`), onSuccess: refresh });
  const others = useMutation({ mutationFn: () => apiSend<{ revoked: number }>('POST', '/me/sessions/revoke-others'), onSuccess: refresh });
  const list = sessions.data ?? [];

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          list.some((s) => !s.current) ? (
            <Button onClick={() => others.mutate()} loading={others.isPending}>
              {t('revokeOthers')}
            </Button>
          ) : null
        }
      />
      {others.data ? <Notice className="mb-4">{t('revokedOthers', { count: others.data.revoked })}</Notice> : null}
      {revoke.error ? <ErrorNotice error={revoke.error} className="mb-4" /> : null}
      <Card>
        {sessions.isPending ? (
          <PageSpinner />
        ) : sessions.error ? (
          <ErrorNotice error={sessions.error} className="m-4" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('device')}</TH>
                <TH>{t('method')}</TH>
                <TH>{t('address')}</TH>
                <TH>{t('signedIn')}</TH>
                <TH>{t('lastSeen')}</TH>
                <TH>
                  <span className="sr-only">{t('actions')}</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {list.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <span className="flex items-center gap-2">
                      {device(s.userAgent) || t('unknownDevice')}
                      {s.current ? <Badge tone="accent">{t('current')}</Badge> : null}
                    </span>
                  </TD>
                  <TD>
                    <code className="font-mono text-xs">{s.method}</code>
                  </TD>
                  <TD className="font-mono text-xs">{s.ip ?? fmt.empty}</TD>
                  <TD className="whitespace-nowrap text-xs">{fmt.dateTime(s.createdAt)}</TD>
                  <TD className="whitespace-nowrap text-xs" title={fmt.dateTime(s.lastSeenAt)}>
                    {fmt.relative(s.lastSeenAt)}
                  </TD>
                  <TD className="text-right">
                    {s.current ? null : (
                      <Button size="sm" variant="danger-outline" onClick={() => revoke.mutate(s.id)} loading={revoke.isPending && revoke.variables === s.id}>
                        {t('revoke')}
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
