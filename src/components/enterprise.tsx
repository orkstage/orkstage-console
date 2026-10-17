// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { EnterpriseFeatureKey } from '@orkstage/contracts';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Notice } from '@/components/ui/error-notice';
import { useFormat } from '@/i18n/format';
import { isPlatformStaff, useMe } from '@/lib/ability';
import { useLicense } from '@/lib/queries';

export const EDITIONS_URL = 'https://orkstage.io/docs/enterprise/editions/';

/** Message keys of the feature names (next-intl reads dots in keys as nesting). */
export const FEATURE_MESSAGE = {
  'audit.export': 'auditExport',
  'auth.saml': 'authSaml',
  'auth.scim': 'authScim',
  'rbac.custom-roles': 'customRoles',
  'approvals.multi-step': 'multiStepApprovals',
  'policies.packs': 'policyPacks',
  'organizations.multiple': 'multipleOrganizations',
  'status.white-label': 'whiteLabelStatus',
} as const satisfies Record<EnterpriseFeatureKey, string>;

/**
 * An Enterprise feature: its children when the license includes it, otherwise a short explanation
 * with links, instead of a control that would fail with 402. Visibility only: the API decides.
 */
export function EnterpriseLock({ feature, children, compact = false }: { feature: EnterpriseFeatureKey; children: ReactNode; compact?: boolean }) {
  const t = useTranslations('enterprise');
  const license = useLicense();
  const me = useMe();
  if (license.data?.features.includes(feature)) return <>{children}</>;
  if (!license.data) return null;
  const name = t(`features.${FEATURE_MESSAGE[feature]}`);
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-fg-subtle" title={t('lockedBody', { feature: name })}>
        <Lock size={12} aria-hidden /> {t('lockedShort', { feature: name })}
      </span>
    );
  }
  return (
    <Notice tone="info">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Lock size={13} aria-hidden />
        <span>{t('lockedBody', { feature: name })}</span>
        {isPlatformStaff(me.data) ? (
          <Link href="/settings/license" className="text-accent-ink underline">
            {t('licenseLink')}
          </Link>
        ) : null}
        <a href={EDITIONS_URL} target="_blank" rel="noreferrer" className="text-accent-ink underline">
          {t('editionsLink')}
        </a>
      </span>
    </Notice>
  );
}

/** For platform staff: the license is in its grace period, or the configured key is not valid. */
export function LicenseBanner() {
  const t = useTranslations('enterprise');
  const fmt = useFormat();
  const license = useLicense();
  const me = useMe();
  if (!isPlatformStaff(me.data) || !license.data) return null;
  const { status, expiresAt, message } = license.data;
  if (status !== 'grace' && status !== 'invalid' && status !== 'expired') return null;
  const text = status === 'grace' ? t('graceBanner', { date: fmt.date(expiresAt) }) : status === 'expired' ? t('expiredBanner') : t('invalidBanner', { reason: message });
  return (
    <Notice tone="warn" className="mb-4">
      <span className="flex flex-wrap items-center gap-x-2">
        <span>{text}</span>
        <Link href="/settings/license" className="text-accent-ink underline">
          {t('licenseLink')}
        </Link>
      </span>
    </Notice>
  );
}
