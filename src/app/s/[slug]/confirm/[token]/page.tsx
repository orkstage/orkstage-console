// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { PublicNotice } from '@/components/status/public-notice';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/error-notice';
import { apiSend } from '@/lib/api';

/** The link in the confirmation email. A button, so link scanners do not confirm on their own. */
export default function ConfirmSubscriptionPage() {
  const t = useTranslations('publicStatus');
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const confirm = useMutation({ mutationFn: () => apiSend('POST', `/public/status/subscriptions/${encodeURIComponent(token)}/confirm`) });
  return (
    <PublicNotice title={t('confirmTitle')}>
      {confirm.isSuccess ? (
        <Notice tone="ok">{t('confirmed')}</Notice>
      ) : confirm.isError ? (
        <Notice tone="warn">{t('linkInvalid')}</Notice>
      ) : (
        <>
          <p className="text-sm">{t('confirmBody')}</p>
          <Button variant="primary" onClick={() => confirm.mutate()} loading={confirm.isPending}>
            {t('confirm')}
          </Button>
        </>
      )}
      <Link href={`/s/${slug}`} className="block text-sm text-accent-ink hover:underline">
        {t('backToPage')}
      </Link>
    </PublicNotice>
  );
}
