'use client';

import type { InvitationPreviewDto } from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { useRoleLabels } from '@/components/app-shell';
import { Button, buttonClass } from '@/components/ui/button';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { PageSpinner } from '@/components/ui/spinner';
import { apiGet, apiSend } from '@/lib/api';
import { useMe } from '@/lib/ability';

/** Accepting an invitation: signed in with the invited address, one click joins the tenant. */
export default function InvitePage() {
  const t = useTranslations('invite');
  const roleLabel = useRoleLabels();
  const router = useRouter();
  const qc = useQueryClient();
  const { token } = useParams<{ token: string }>();
  const me = useMe();
  const invitation = useQuery({ queryKey: ['invitation', token], queryFn: ({ signal }) => apiGet<InvitationPreviewDto>(`/invitations/${token}`, { signal }), retry: false });
  const accept = useMutation({
    mutationFn: () => apiSend<{ tenantId: string }>('POST', `/invitations/${token}/accept`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace('/');
    },
  });

  let body;
  if (invitation.isPending || me.isPending) body = <PageSpinner />;
  else if (invitation.error) body = <ErrorNotice error={new Error(t('notFound'))} />;
  else if (invitation.data.status !== 'pending') body = <Notice tone="warn">{t(invitation.data.status === 'accepted' ? 'used' : 'expired')}</Notice>;
  else {
    const i = invitation.data;
    body = (
      <div className="space-y-4">
        <p className="text-sm">{t('summary', { tenant: i.tenantName, role: roleLabel.role(i.role) })}</p>
        <p className="text-xs text-fg-muted">{t('forEmail', { email: i.emailHint })}</p>
        {accept.error ? <ErrorNotice error={accept.error} /> : null}
        {me.data ? (
          <Button variant="primary" onClick={() => accept.mutate()} loading={accept.isPending}>
            <UserPlus size={14} aria-hidden /> {t('accept', { tenant: i.tenantName })}
          </Button>
        ) : (
          <Link className={buttonClass('primary')} href={`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>
            {t('signIn')}
          </Link>
        )}
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-lg border border-border bg-surface p-6">
        <h1 className="font-display text-xl font-semibold">{t('title')}</h1>
        {body}
      </div>
    </main>
  );
}
