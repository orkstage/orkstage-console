// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { PublicNotice } from '@/components/status/public-notice';
import { Button } from '@/components/ui/button';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { apiSend } from '@/lib/api';

/** The link at the end of every status update email. */
export default function UnsubscribePage() {
  const t = useTranslations('publicStatus');
  const { token } = useParams<{ token: string }>();
  const leave = useMutation({ mutationFn: () => apiSend('DELETE', `/public/status/subscriptions/${encodeURIComponent(token)}`) });
  return (
    <PublicNotice title={t('unsubscribeTitle')}>
      {leave.isSuccess ? (
        <Notice tone="ok">{t('unsubscribed')}</Notice>
      ) : (
        <>
          <p className="text-sm">{t('unsubscribeBody')}</p>
          {leave.error ? <ErrorNotice error={leave.error} /> : null}
          <Button variant="primary" onClick={() => leave.mutate()} loading={leave.isPending}>
            {t('unsubscribe')}
          </Button>
        </>
      )}
    </PublicNotice>
  );
}
