// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { cloneTemplateSchema, type TemplateDto, type TemplateVersionDto, type ValidationIssueDto } from '@orkstage/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, CheckCircle2, Copy, FilePlus2, Pencil, Save, Send, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { IssuesList } from '@/components/plan-view';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { describedBy, Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { YamlViewer } from '@/components/yaml-viewer';
import { useFormat } from '@/i18n/format';
import { useZodResolver } from '@/i18n/zod';
import { apiSend, isApiError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { useCan } from '@/lib/ability';
import { useTemplate, useTenants } from '@/lib/queries';
import { readTemplateDoc } from '@/lib/template-doc';
import { lineDiff } from '@/lib/line-diff';
import { cn } from '@/lib/utils';

interface ValidationReport {
  valid: boolean;
  issues: ValidationIssueDto[];
}

/** Publish/create failures may carry validation issues in `error.details.issues`. */
function issuesFromError(err: unknown): ValidationIssueDto[] {
  if (!isApiError(err)) return [];
  const issues = err.details.issues;
  return Array.isArray(issues) ? (issues as ValidationIssueDto[]) : [];
}

export default function TemplatePage() {
  const tt = useTranslations('templates');
  const td = useTranslations('templates.detail');
  const fmt = useFormat();
  const { id } = useParams<{ id: string }>();
  const q = useTemplate(id);
  useDocumentTitle(q.data?.displayName);
  const can = useCan();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [cloning, setCloning] = useState(false);

  if (q.isPending) return <PageSpinner />;
  if (q.error) return <ErrorNotice error={q.error} title={tt('unavailable')} />;
  const t = q.data;
  const versions = [...(t.versions ?? (t.latestPublished ? [t.latestPublished] : []))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
  const doc = selected ? readTemplateDoc(selected.document) : null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/templates" className="hover:underline">
            {tt('breadcrumb')}
          </Link>
        }
        title={t.displayName}
        description={t.description}
        meta={
          <>
            <code className="font-mono text-xs text-fg-subtle">{t.name}</code>
            {t.visibility === 'SYSTEM' ? <Badge tone="info">{tt('system')}</Badge> : <Badge>{tt('organization')}</Badge>}
            {doc?.nonProduction ? <Badge tone="warn">{tt('nonProduction')}</Badge> : null}
          </>
        }
        actions={
          <>
            <ButtonLink href={`/templates/${t.id}/builder${selected ? `?version=${selected.id}` : ''}`}>
              <Workflow size={14} aria-hidden /> {t.visibility === 'SYSTEM' || !can('update', 'Template') ? td('viewInBuilder') : td('openInBuilder')}
            </ButtonLink>
            {can('create', 'Template') ? (
              <Button onClick={() => setCloning(true)}>
                <Copy size={14} aria-hidden /> {td('clone')}
              </Button>
            ) : null}
            {can('update', 'Template') && !editing ? (
              <Button variant="primary" onClick={() => setEditing(true)}>
                <FilePlus2 size={14} aria-hidden /> {td('newVersion')}
              </Button>
            ) : null}
          </>
        }
      />

      {editing ? (
        <VersionEditor
          template={t}
          initialSource={selected?.source ?? ''}
          onClose={() => setEditing(false)}
          onSaved={(v) => setSelectedId(v.id)}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card>
          <CardHeader title={td('versions')} as="h2" />
          <ul className="divide-y divide-border">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(v.id)}
                  aria-current={selected?.id === v.id ? 'true' : undefined}
                  className={cn('flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-surface-2', selected?.id === v.id && 'bg-accent/8')}
                >
                  <span>
                    <code className="block font-mono text-sm">{v.version}</code>
                    <span className="text-[11px] text-fg-subtle">{fmt.dateTime(v.publishedAt ?? v.createdAt)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <StatusBadge status={v.status} />
                    {typeof v.instanceCount === 'number' ? <span className="text-[11px] text-fg-subtle">{td('instanceCount', { count: v.instanceCount })}</span> : null}
                  </span>
                </button>
              </li>
            ))}
            {versions.length === 0 ? <li className="px-4 py-3 text-sm text-fg-subtle">{td('noVersions')}</li> : null}
          </ul>
        </Card>

        {selected ? (
          <VersionDetail
            template={t}
            version={selected}
            others={versions.filter((v) => v.id !== selected.id)}
            canPublish={can('publish', 'Template')}
            canEdit={can('update', 'Template') && t.visibility !== 'SYSTEM'}
          />
        ) : null}
      </div>

      <Dialog open={cloning} onClose={() => setCloning(false)} title={td('cloneTitle', { name: t.displayName })} description={td('cloneDescription')}>
        <CloneForm template={t} onDone={() => setCloning(false)} />
      </Dialog>
    </>
  );
}

function VersionDetail({
  template,
  version,
  others,
  canPublish,
  canEdit,
}: {
  template: TemplateDto;
  version: TemplateVersionDto;
  others: TemplateVersionDto[];
  canPublish: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations('templates.detail');
  const fmt = useFormat();
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['template', template.id] });
    void qc.invalidateQueries({ queryKey: ['templates'] });
  };
  const publish = useMutation({
    mutationFn: () => apiSend<TemplateVersionDto>('POST', `/templates/${template.id}/versions/${version.id}/publish`),
    onSuccess: refresh,
  });
  const restore = useMutation({ mutationFn: () => apiSend<TemplateVersionDto>('POST', `/templates/${template.id}/versions/${version.id}/restore`), onSuccess: refresh });
  const [editingDraft, setEditingDraft] = useState(false);
  const [deprecating, setDeprecating] = useState(false);
  const [compareId, setCompareId] = useState('');
  const doc = readTemplateDoc(version.document);
  const publishIssues = issuesFromError(publish.error);
  const compareWith = others.find((o) => o.id === compareId) ?? null;

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {t.rich('version', { version: version.version, code: (chunks) => <code className="font-mono">{chunks}</code> })} <StatusBadge status={version.status} />
            </span>
          }
          description={
            version.publishedAt
              ? t('createdPublished', { date: fmt.dateTime(version.createdAt), published: fmt.dateTime(version.publishedAt) })
              : t('created', { date: fmt.dateTime(version.createdAt) })
          }
          actions={
            <>
              {version.status === 'DRAFT' && canEdit && !editingDraft ? (
                <Button onClick={() => setEditingDraft(true)}>
                  <Pencil size={14} aria-hidden /> {t('editDraft')}
                </Button>
              ) : null}
              {version.status === 'DRAFT' && canPublish ? (
                <Button variant="primary" onClick={() => publish.mutate()} loading={publish.isPending}>
                  <Send size={14} aria-hidden /> {t('publish')}
                </Button>
              ) : null}
              {version.status === 'PUBLISHED' && canPublish ? (
                <Button onClick={() => setDeprecating(true)}>
                  <Archive size={14} aria-hidden /> {t('deprecate')}
                </Button>
              ) : null}
              {version.status === 'DEPRECATED' && canPublish ? (
                <Button onClick={() => restore.mutate()} loading={restore.isPending}>
                  <ArchiveRestore size={14} aria-hidden /> {t('restore')}
                </Button>
              ) : null}
            </>
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {doc.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
            <Badge>{t('placementSlots', { count: doc.placements.length })}</Badge>
            <Badge>{t('resources', { count: doc.resourceCount })}</Badge>
            <Badge>{t('variables', { count: doc.variables.length })}</Badge>
          </div>
          {version.validation ? (
            version.validation.valid && version.validation.issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-ok-ink">
                <CheckCircle2 size={14} aria-hidden /> {t('validationPassed')}
              </p>
            ) : (
              <IssuesList issues={version.validation.issues} />
            )
          ) : (
            <p className="text-xs text-fg-subtle">{t('notValidated')}</p>
          )}
          {version.status === 'DEPRECATED' && version.deprecatedAt ? (
            <Notice tone="warn">
              {t('deprecatedOn', { date: fmt.dateTime(version.deprecatedAt) })} {version.deprecationNote ?? ''}
            </Notice>
          ) : null}
          {restore.error ? <ErrorNotice error={restore.error} /> : null}
          {publish.error ? <ErrorNotice error={publish.error} title={t('publishRefused')} /> : null}
          {publishIssues.length > 0 ? <IssuesList issues={publishIssues} /> : null}
          {publish.isSuccess ? <Notice tone="ok">{t('published')}</Notice> : null}
        </CardBody>
      </Card>
      {editingDraft ? (
        <DraftEditor templateId={template.id} version={version} onDone={() => setEditingDraft(false)} onSaved={refresh} />
      ) : (
        <Card>
          <CardHeader
            title={t('source')}
            as="h3"
            description={t('sourceHint')}
            actions={
              others.length > 0 ? (
                <Select aria-label={t('compare')} value={compareId} onChange={(e) => setCompareId(e.target.value)} className="w-48">
                  <option value="">{t('noCompare')}</option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {t('compare')} {o.version}
                    </option>
                  ))}
                </Select>
              ) : null
            }
          />
          <CardBody>{compareWith ? <DiffView from={compareWith} to={version} /> : <YamlViewer source={version.source} />}</CardBody>
        </Card>
      )}
      <Dialog open={deprecating} onClose={() => setDeprecating(false)} title={t('deprecateTitle', { version: version.version })} description={t('deprecateHint')}>
        {deprecating ? (
          <DeprecateForm
            templateId={template.id}
            versionId={version.id}
            onDone={() => {
              setDeprecating(false);
              refresh();
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

/** The older version on the left of the comparison, whichever was picked. */
function DiffView({ from, to }: { from: TemplateVersionDto; to: TemplateVersionDto }) {
  const t = useTranslations('templates.detail');
  const [older, newer] = from.createdAt <= to.createdAt ? [from, to] : [to, from];
  const lines = lineDiff(older.source, newer.source);
  const added = lines.filter((l) => l.kind === 'added').length;
  const removed = lines.filter((l) => l.kind === 'removed').length;
  const title = t('diffTitle', { from: older.version, to: newer.version });
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-muted">
        {title} · {added + removed === 0 ? t('noChanges') : t('diffSummary', { added, removed })}
      </p>
      <pre className="max-h-[32rem] overflow-auto rounded-md border border-border bg-bg p-2 font-mono text-xs leading-5" aria-label={title}>
        {lines.map((l, i) => (
          <div key={i} className={cn('whitespace-pre-wrap px-1', l.kind === 'added' && 'bg-ok/12 text-ok-ink', l.kind === 'removed' && 'bg-danger/10 text-danger-ink')}>
            <span aria-hidden className="select-none pr-2 text-fg-subtle">
              {l.kind === 'added' ? '+' : l.kind === 'removed' ? '-' : ' '}
            </span>
            {l.text}
          </div>
        ))}
      </pre>
    </div>
  );
}

function DraftEditor({ templateId, version, onDone, onSaved }: { templateId: string; version: TemplateVersionDto; onDone: () => void; onSaved: () => void }) {
  const t = useTranslations('templates.detail');
  const [source, setSource] = useState(version.source);
  const save = useMutation({
    mutationFn: () => apiSend<TemplateVersionDto>('PUT', `/templates/${templateId}/versions/${version.id}`, { source }),
    onSuccess: onSaved,
  });
  const issues = issuesFromError(save.error);
  return (
    <Card>
      <CardHeader title={t('editDraft')} as="h3" />
      <CardBody className="space-y-3">
        <Textarea aria-label={t('source')} value={source} onChange={(e) => setSource(e.target.value)} rows={24} spellCheck={false} className="font-mono text-xs" />
        {save.error ? <ErrorNotice error={save.error} /> : null}
        {issues.length > 0 ? <IssuesList issues={issues} /> : null}
        {save.isSuccess ? <Notice tone="ok">{t('draftSaved')}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onDone}>{t('cancelEdit')}</Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={source === version.source}>
            <Save size={14} aria-hidden /> {t('saveDraft')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function DeprecateForm({ templateId, versionId, onDone }: { templateId: string; versionId: string; onDone: () => void }) {
  const t = useTranslations('templates.detail');
  const [note, setNote] = useState('');
  const deprecate = useMutation({
    mutationFn: () => apiSend('POST', `/templates/${templateId}/versions/${versionId}/deprecate`, note.trim() ? { note: note.trim() } : {}),
    onSuccess: onDone,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        deprecate.mutate();
      }}
    >
      <Field label={t('deprecationNote')} htmlFor="dep-note">
        <Input id="dep-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t('deprecationNotePlaceholder')} />
      </Field>
      {deprecate.error ? <ErrorNotice error={deprecate.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{t('cancelEdit')}</Button>
        <Button type="submit" variant="primary" loading={deprecate.isPending}>
          {t('deprecateSave')}
        </Button>
      </div>
    </form>
  );
}

function VersionEditor({ template, initialSource, onClose, onSaved }: { template: TemplateDto; initialSource: string; onClose: () => void; onSaved: (v: TemplateVersionDto) => void }) {
  const t = useTranslations('templates.editor');
  const td = useTranslations('templates.detail');
  const qc = useQueryClient();
  const [source, setSource] = useState(initialSource);
  const tenants = useTenants();
  const [tenantId, setTenantId] = useState('');
  const [saved, setSaved] = useState<TemplateVersionDto | null>(null);

  const validate = useMutation({
    mutationFn: () => apiSend<ValidationReport>('POST', `/templates/${template.id}/validate`, { source, ...(tenantId ? { tenantId } : {}) }),
  });
  const save = useMutation({
    mutationFn: () => apiSend<TemplateVersionDto>('POST', `/templates/${template.id}/versions`, { source }),
    onSuccess: (v) => {
      setSaved(v);
      onSaved(v);
      void qc.invalidateQueries({ queryKey: ['template', template.id] });
    },
  });
  const publish = useMutation({
    mutationFn: (versionId: string) => apiSend<TemplateVersionDto>('POST', `/templates/${template.id}/versions/${versionId}/publish`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['template', template.id] });
      void qc.invalidateQueries({ queryKey: ['templates'] });
      onClose();
    },
  });

  const report = validate.data;
  const issues = report?.issues ?? [];
  const errorIssues = [...issuesFromError(save.error), ...issuesFromError(publish.error)];

  return (
    <Card className="mb-4">
      <CardHeader
        title={t('title')}
        description={t('hint')}
        actions={
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('close')}
          </Button>
        }
      />
      <CardBody className="space-y-3">
        <label htmlFor="tpl-source" className="sr-only">
          {t('yaml')}
        </label>
        <Textarea
          id="tpl-source"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setSaved(null);
          }}
          spellCheck={false}
          className="min-h-[28rem] font-mono text-xs leading-relaxed"
        />
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="tpl-tenant" className="mb-1 block text-xs text-fg-subtle">
              {t('tenant')}
            </label>
            <Select id="tpl-tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-44">
              <option value="">{t('anyTenant')}</option>
              {(tenants.data ?? []).map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={() => validate.mutate()} loading={validate.isPending} disabled={!source.trim()}>
            {t('validate')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!source.trim() || !!saved}>
            {t('saveDraft')}
          </Button>
          <Button variant="primary" onClick={() => saved && publish.mutate(saved.id)} loading={publish.isPending} disabled={!saved} title={!saved ? t('saveFirst') : undefined}>
            <Send size={14} aria-hidden /> {td('publish')}
          </Button>
          {saved ? <span className="text-xs text-ok-ink">{t('savedAs', { version: saved.version })}</span> : null}
        </div>
        {validate.error ? <ErrorNotice error={validate.error} /> : null}
        {report ? (
          report.valid && issues.length === 0 ? (
            <Notice tone="ok">{t('valid')}</Notice>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">{report.valid ? t('validWithWarnings') : t('invalid')}</p>
              <IssuesList issues={issues} />
            </div>
          )
        ) : null}
        {save.error ? <ErrorNotice error={save.error} title={t('saveFailed')} /> : null}
        {publish.error ? <ErrorNotice error={publish.error} title={td('publishRefused')} /> : null}
        {errorIssues.length > 0 ? <IssuesList issues={errorIssues} /> : null}
      </CardBody>
    </Card>
  );
}

function CloneForm({ template, onDone }: { template: TemplateDto; onDone: () => void }) {
  const t = useTranslations('templates.cloneForm');
  const tc = useTranslations('common');
  const router = useRouter();
  const qc = useQueryClient();
  const form = useForm({
    resolver: useZodResolver(cloneTemplateSchema),
    defaultValues: { name: `${template.name}-copy`.slice(0, 63), displayName: `${template.displayName} ${t('copySuffix')}`.slice(0, 80) },
  });
  const { errors } = form.formState;
  const clone = useMutation({
    mutationFn: (v: { name: string; displayName: string }) => apiSend<TemplateDto>('POST', `/templates/${template.id}/clone`, v),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['templates'] });
      onDone();
      router.push(`/templates/${res.id}`);
    },
  });
  return (
    <form onSubmit={form.handleSubmit((v) => clone.mutate(v))} className="space-y-4" noValidate>
      <Field label={t('name')} htmlFor="clone-name" hint={t('nameHint')} error={errors.name?.message} required>
        <Input id="clone-name" className="font-mono" autoFocus {...describedBy('clone-name', { hint: true, error: errors.name })} {...form.register('name')} />
      </Field>
      <Field label={t('displayName')} htmlFor="clone-display" error={errors.displayName?.message} required>
        <Input id="clone-display" {...describedBy('clone-display', { error: errors.displayName })} {...form.register('displayName')} />
      </Field>
      {clone.error ? <ErrorNotice error={clone.error} /> : null}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>{tc('cancel')}</Button>
        <Button type="submit" variant="primary" loading={clone.isPending}>
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}
