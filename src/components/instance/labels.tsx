// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Tag } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { apiSend } from '@/lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardBody, CardHeader } from '../ui/card';
import { Dialog } from '../ui/dialog';
import { ErrorNotice, Notice } from '../ui/error-notice';
import { Field } from '../ui/input';
import { Textarea } from '../ui/textarea';

/** Labels of an instance (open item 12): tags on every cloud resource, required by some policies. */
export function LabelsCard({ instanceId, labels, canEdit }: { instanceId: string; labels: Record<string, string>; canEdit: boolean }) {
  const t = useTranslations('instance');
  const [open, setOpen] = useState(false);
  const entries = Object.entries(labels);
  return (
    <Card>
      <CardHeader
        title={t('labels')}
        description={t('labelsHint')}
        as="h3"
        actions={
          canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={t('editLabels')}>
              <Pencil size={13} aria-hidden />
            </Button>
          ) : null
        }
      />
      <CardBody>
        {entries.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t('noLabels')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {entries.map(([k, v]) => (
              <Badge key={k} tone="neutral">
                <Tag size={11} aria-hidden /> <span className="font-mono">{k}={v}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardBody>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('editLabels')}>
        {open ? <LabelsForm instanceId={instanceId} labels={labels} onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </Card>
  );
}

function LabelsForm({ instanceId, labels, onDone }: { instanceId: string; labels: Record<string, string>; onDone: () => void }) {
  const t = useTranslations('instance');
  const tc = useTranslations('common');
  const qc = useQueryClient();
  const [text, setText] = useState(() => Object.entries(labels).map(([k, v]) => `${k}=${v}`).join('\n'));
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (next: Record<string, string>) => apiSend('PATCH', `/instances/${instanceId}`, { labels: next }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['instance', instanceId] });
      onDone();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const pairs = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => /^([^=\s]+)\s*=\s*(.+)$/.exec(l));
        setInvalid(pairs.some((p) => !p));
        if (pairs.every(Boolean)) save.mutate(Object.fromEntries(pairs.map((p) => [p![1]!, p![2]!.trim()])));
      }}
    >
      <Field label={t('labelsField')} htmlFor="inst-labels">
        <Textarea id="inst-labels" rows={5} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" placeholder="team=payments" />
      </Field>
      {invalid ? <Notice tone="warn">{t('labelsInvalid')}</Notice> : null}
      {save.error ? <ErrorNotice error={save.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{tc('cancel')}</Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t('saveLabels')}
        </Button>
      </div>
    </form>
  );
}
