// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import type { DeploymentSummaryDto, MeResponse, Page } from '@orkstage/contracts';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { apiGet } from '@/lib/api';
import { isPlatformStaff, useMe } from '@/lib/ability';
import { useCloudTargets, useInstances, useProfiles, useTemplates, useTenants } from '@/lib/queries';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';

const DOCS = 'https://orkstage.io/docs/';
const INSTALL_CLI = 'curl -fsSL https://orkstage.io/install.sh | sh';

export type SetupPhase = 'connect' | 'customers' | 'deliver' | 'operate';
export type SetupStepKey = 'target' | 'profile' | 'tenant' | 'team' | 'template' | 'instance' | 'deploy' | 'observe' | 'automate';

export interface SetupStep {
  key: SetupStepKey;
  phase: SetupPhase;
  href: string;
  /** Path under orkstage.io/docs/. */
  docs: string;
  /** Recommended but not tracked: the guide cannot tell when it is done. */
  optional?: boolean;
  /** A shell command shown under the step, copied as is. */
  command?: string;
  done: boolean;
}

/** Customer roles that manage the tenant (instances, keys, webhooks). */
const ADMIN_ROLES = new Set(['CustomerOwner', 'CustomerAdmin']);

/**
 * The guided setup, in order. Platform staff set up the whole platform; tenant members get the
 * part of it their role can do. "Done" comes from data the console already loads.
 */
export function useSetupSteps(): { steps: SetupStep[]; loading: boolean; staff: boolean } {
  const me = useMe();
  const staff = isPlatformStaff(me.data);

  const targets = useCloudTargets(staff);
  const profiles = useProfiles(undefined, staff);
  const tenants = useTenants(staff);
  const templates = useTemplates(staff);
  const instances = useInstances();
  const deployments = useQuery({
    queryKey: ['onboarding-deployments'],
    queryFn: ({ signal }) => apiGet<Page<DeploymentSummaryDto>>('/deployments?limit=10', { signal }),
    staleTime: 30_000,
  });

  const deps = deployments.data?.items ?? [];
  const deployed = deps.some((d) => d.kind === 'APPLY' && d.status === 'SUCCEEDED');
  const hasInstance = (instances.data ?? []).length > 0;

  if (staff) {
    const steps: SetupStep[] = [
      { key: 'target', phase: 'connect', href: '/cloud-targets/connect', docs: 'self-hosting/connect-aws/', done: (targets.data ?? []).some((t) => t.lastValidation?.ok) },
      { key: 'profile', phase: 'connect', href: '/profiles', docs: 'get-started/core-concepts/', done: (profiles.data ?? []).length > 0 },
      { key: 'tenant', phase: 'customers', href: '/tenants', docs: 'user-guide/roles/', done: (tenants.data ?? []).length > 0 },
      { key: 'team', phase: 'customers', href: '/settings/team', docs: 'user-guide/roles/', optional: true, done: false },
      { key: 'template', phase: 'deliver', href: '/templates', docs: 'user-guide/templates/', done: (templates.data ?? []).some((t) => t.latestPublished) },
      { key: 'instance', phase: 'deliver', href: '/instances/new', docs: 'user-guide/create-instance/', done: hasInstance },
      { key: 'deploy', phase: 'deliver', href: '/deployments', docs: 'user-guide/deploy/', done: deployed },
      { key: 'observe', phase: 'operate', href: '/incidents', docs: 'user-guide/status-and-incidents/', optional: true, done: false },
      { key: 'automate', phase: 'operate', href: '/settings/integrations', docs: 'developer/cli/', optional: true, command: INSTALL_CLI, done: false },
    ];
    const loading = targets.isPending || profiles.isPending || tenants.isPending || templates.isPending || instances.isPending;
    return { steps, loading, staff };
  }

  const roles = new Set((me.data?.memberships ?? []).map((m) => m.role));
  const admin = [...roles].some((r) => ADMIN_ROLES.has(r));
  const owner = roles.has('CustomerOwner');
  const steps: SetupStep[] = [];
  if (owner) steps.push({ key: 'team', phase: 'customers', href: '/settings/team', docs: 'user-guide/roles/', optional: true, done: false });
  if (admin) steps.push({ key: 'instance', phase: 'deliver', href: '/instances/new', docs: 'user-guide/create-instance/', done: hasInstance });
  steps.push({ key: 'deploy', phase: 'deliver', href: '/deployments', docs: 'user-guide/deploy/', done: deployed });
  steps.push({ key: 'observe', phase: 'operate', href: '/incidents', docs: 'user-guide/status-and-incidents/', optional: true, done: false });
  if (admin) steps.push({ key: 'automate', phase: 'operate', href: '/settings/integrations', docs: 'developer/cli/', optional: true, command: INSTALL_CLI, done: false });
  return { steps, loading: instances.isPending, staff };
}

export function docsUrl(path: string): string {
  return `${DOCS}${path}`;
}

const welcomeKey = (me: MeResponse) => `orkstage-welcome-seen:${me.user.id}`;

/**
 * Shown once per person and browser, on the first visit after sign in: what OrkStage does and a
 * way into the guided setup. Platform staff only see it while no cloud target has passed
 * validation, so an installation that is already running does not greet its operators.
 */
export function WelcomeDialog() {
  const t = useTranslations('gettingStarted.welcome');
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [seen, setSeen] = useState(true);
  const staff = isPlatformStaff(me.data);
  const targets = useCloudTargets(staff);

  useEffect(() => {
    if (!me.data) return;
    try {
      setSeen(localStorage.getItem(welcomeKey(me.data)) === '1');
    } catch {
      setSeen(true);
    }
  }, [me.data]);

  const close = () => {
    setSeen(true);
    try {
      if (me.data) localStorage.setItem(welcomeKey(me.data), '1');
    } catch {
      /* private mode: show again next time, harmless */
    }
  };

  const configured = staff && (targets.data ?? []).some((target) => target.lastValidation?.ok);
  const ready = me.data && (!staff || targets.isSuccess);
  const open = Boolean(ready) && !seen && !configured && !pathname.startsWith('/getting-started');
  const points = staff ? (['staffConnect', 'staffCustomers', 'staffDeliver', 'staffOperate'] as const) : (['memberDeliver', 'memberOperate', 'memberAutomate'] as const);

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('title')}
      description={staff ? t('staffIntro') : t('memberIntro')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('later')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              close();
              router.push('/getting-started');
            }}
          >
            {t('start')}
          </Button>
        </>
      }
    >
      <ol className="space-y-2.5 text-sm">
        {points.map((p, i) => (
          <li key={p} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-control text-[11px] font-semibold text-fg-muted" aria-hidden>
              {i + 1}
            </span>
            <span>{t(`points.${p}`)}</span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
