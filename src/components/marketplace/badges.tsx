// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { BadgeCheck, Wrench } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Badge } from '../ui/badge';

/** Review badges of a marketplace listing, with what each one means on hover. */
export function ListingBadges({ badges }: { badges: string[] }) {
  const t = useTranslations('marketplace');
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.includes('VERIFIED') ? (
        <Badge tone="ok" title={t('badgeHelp.VERIFIED')}>
          <BadgeCheck size={12} aria-hidden /> {t('badges.VERIFIED')}
        </Badge>
      ) : null}
      {badges.includes('DEVOPS') ? (
        <Badge tone="info" title={t('badgeHelp.DEVOPS')}>
          <Wrench size={12} aria-hidden /> {t('badges.DEVOPS')}
        </Badge>
      ) : null}
    </div>
  );
}

/** Message key of a category id (`disaster-recovery` becomes `disasterRecovery`). */
export const categoryKey = (category: string) => category.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
