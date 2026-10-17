// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useTranslations } from 'use-intl';
import { useLicense } from '@/lib/queries';
import { Badge } from './ui/badge';

/** Edition indicator in the sidebar. Visibility only: the API enforces Enterprise features. */
export function EditionBadge() {
  const t = useTranslations('edition');
  const license = useLicense();
  if (!license.data) return null;
  const { edition, status, message } = license.data;
  if (edition === 'community') {
    return (
      <Badge title={status === 'invalid' ? message : t('communityTitle')} tone={status === 'invalid' ? 'warn' : 'neutral'}>
        {t('community')}
      </Badge>
    );
  }
  return (
    <Badge tone={status === 'active' ? 'accent' : 'warn'} title={message}>
      {status === 'active' ? t('enterprise') : status === 'grace' ? t('renew') : t('expired')}
    </Badge>
  );
}
