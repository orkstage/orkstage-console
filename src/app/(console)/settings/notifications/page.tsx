// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { NotificationPreferencesDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { PageHeader } from '@/components/ui/page-header';
import { PageSpinner } from '@/components/ui/spinner';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiGet, apiSend } from '@/lib/api';

type Channel = NotificationPreferencesDto['channels'][number];
const key = (event: string, channel: Channel) => `${event}:${channel}`;

/** What reaches each person, per event and channel (open item 16). */
export default function NotificationSettingsPage() {
  const t = useTranslations('notificationSettings');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notification-preferences'], queryFn: ({ signal }) => apiGet<NotificationPreferencesDto>('/me/notification-preferences', { signal }) });
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (q.data) setState(Object.fromEntries(q.data.preferences.map((p) => [key(p.event, p.channel), p.enabled])));
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      apiSend<NotificationPreferencesDto>('PUT', '/me/notification-preferences', {
        preferences: q.data!.preferences.map((p) => ({ event: p.event, channel: p.channel, enabled: state[key(p.event, p.channel)] ?? true })),
      }),
    onSuccess: (data) => qc.setQueryData(['notification-preferences'], data),
  });
  const label = (c: Channel) => (c === 'in_app' ? t('inApp') : t('email'));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          q.data ? (
            <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>
              <Save size={14} aria-hidden /> {t('save')}
            </Button>
          ) : null
        }
      />
      {save.error ? <ErrorNotice error={save.error} /> : null}
      {save.isSuccess ? <Notice tone="ok">{t('saved')}</Notice> : null}
      <Notice tone="info">{t('chatHint')}</Notice>
      <Card>
        {q.isPending ? (
          <PageSpinner />
        ) : q.error ? (
          <ErrorNotice error={q.error} className="m-4" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('event')}</TH>
                {q.data.channels.map((c) => (
                  <TH key={c} className="w-28 text-center">
                    {label(c)}
                  </TH>
                ))}
              </tr>
            </THead>
            <TBody>
              {q.data.events.map((event) => (
                <TR key={event}>
                  <TD>
                    <code className="font-mono text-xs">{event}</code>
                  </TD>
                  {q.data.channels.map((c) => (
                    <TD key={c} className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`${event}: ${label(c)}`}
                        checked={state[key(event, c)] ?? true}
                        onChange={(e) => setState((prev) => ({ ...prev, [key(event, c)]: e.target.checked }))}
                      />
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
