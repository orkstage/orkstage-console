// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import {
  createInstanceSchema,
  ENVIRONMENTS,
  type CloudTargetDto,
  type CreateInstanceInput,
  type InstanceDto,
  type NewInstancePreviewDto,
  type ProfileDto,
  type TemplateDto,
  type TemplateVersionDto,
  type TenantDto,
} from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { PreviewReport } from '@/components/plan-view';
import { LimitsSummary } from '@/components/tenant-limits';
import { Badge, SimulatedBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { describedBy, Field, Input } from '@/components/ui/input';
import { Disclosure, KeyValues, PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner, Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { useFormat } from '@/i18n/format';
import { useEnvironmentLabel } from '@/i18n/labels';
import { useZodResolver } from '@/i18n/zod';
import { apiSend } from '@/lib/api';
import { useCloudTargets, useProfiles, useTemplate, useTemplates, useTenants } from '@/lib/queries';
import { checkVariable, readTemplateDoc, type PlacementSlot, type TemplateDocView, type TemplateVariable, type VariableIssue } from '@/lib/template-doc';
import { cn, slugify } from '@/lib/utils';

type StepId = 'tenant' | 'template' | 'placement' | 'variables' | 'details' | 'plan' | 'review';
const STEPS: { id: StepId }[] = [{ id: 'tenant' }, { id: 'template' }, { id: 'placement' }, { id: 'variables' }, { id: 'details' }, { id: 'plan' }, { id: 'review' }];

type Binding = { targetId: string; region: string };
type VarValue = string | number | boolean;
interface Details {
  name: string;
  slug: string;
  environment: (typeof ENVIRONMENTS)[number];
}

export default function NewInstancePage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <NewInstanceWizard />
    </Suspense>
  );
}

function NewInstanceWizard() {
  const t = useTranslations('wizard');
  const tc = useTranslations('common');
  const fmt = useFormat();
  const router = useRouter();
  const qc = useQueryClient();
  const tenants = useTenants();
  const templates = useTemplates();
  const targets = useCloudTargets();

  const [step, setStep] = useState<StepId>('tenant');
  const [tenantId, setTenantId] = useState('');
  // ?template=&version= (from the marketplace) preselect the template step.
  const search = useSearchParams();
  const [templateId, setTemplateId] = useState(search.get('template') ?? '');
  const [versionId, setVersionId] = useState(search.get('version') ?? '');
  const [bindings, setBindings] = useState<Record<string, Binding>>({});
  const [variables, setVariables] = useState<Record<string, VarValue>>({});
  const [details, setDetails] = useState<Details>({ name: '', slug: '', environment: 'production' });
  // ADR 0007: a profile fills the slots with its target and region per provider.
  const profiles = useProfiles(tenantId || undefined, Boolean(tenantId));
  const [profileId, setProfileId] = useState('');
  const profile = profiles.data?.find((p) => p.id === profileId) ?? null;

  // A single tenant? Preselect it.
  useEffect(() => {
    if (!tenantId && tenants.data?.length === 1) setTenantId(tenants.data[0]!.id);
  }, [tenants.data, tenantId]);

  const template = useTemplate(templateId || null);
  const templateSummary = templates.data?.find((t) => t.id === templateId) ?? null;
  const publishedVersions: TemplateVersionDto[] = useMemo(() => {
    const fromDetail = template.data?.versions?.filter((v) => v.status === 'PUBLISHED') ?? [];
    if (fromDetail.length > 0) return fromDetail;
    return templateSummary?.latestPublished ? [templateSummary.latestPublished] : [];
  }, [template.data, templateSummary]);
  const version = publishedVersions.find((v) => v.id === versionId) ?? null;
  const doc = useMemo(() => (version ? readTemplateDoc(version.document) : null), [version]);

  // Reset dependent state when the template version changes; seed variable defaults.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!doc || !version || seededFor === version.id) return;
    setSeededFor(version.id);
    setVariables(Object.fromEntries(doc.variables.map((v) => [v.name, v.default])));
    setBindings({});
    setProfileId('');
  }, [doc, version, seededFor]);

  const tenant = tenants.data?.find((t) => t.id === tenantId) ?? null;

  const eligibleTargets = (slot: PlacementSlot): CloudTargetDto[] =>
    (targets.data ?? []).filter(
      (t) => t.status === 'ACTIVE' && (t.tenantId === null || t.tenantId === tenantId) && (slot.providers.length === 0 || slot.providers.includes(t.provider)),
    );

  const variableErrors = doc ? Object.fromEntries(doc.variables.map((v) => [v.name, checkVariable(v, variables[v.name])])) : {};

  const canAdvance: Record<StepId, boolean> = {
    tenant: !!tenantId,
    template: !!version && !!doc,
    placement: !!doc && doc.placements.every((s) => bindings[s.name]?.targetId && bindings[s.name]?.region),
    variables: Object.values(variableErrors).every((e) => e === null),
    details: !!details.name && !!details.slug,
    plan: false,
    review: true,
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const go = (delta: number) => {
    const next = STEPS[stepIndex + delta];
    if (next) setStep(next.id);
  };

  const payload: CreateInstanceInput = {
    tenantId,
    templateVersionId: versionId,
    name: details.name,
    slug: details.slug,
    environment: details.environment,
    variables,
    bindings,
    labels: {},
    ...(profileId ? { profileId } : {}),
  };
  const parsed = createInstanceSchema.safeParse(payload);

  // The plan of the instance before it exists (open item 14), refreshed when the inputs change.
  const planInput = parsed.success ? JSON.stringify(payload) : '';
  const plan = useQuery({
    queryKey: ['instance-preview', planInput],
    queryFn: () => apiSend<NewInstancePreviewDto>('POST', '/instances/preview', payload),
    enabled: Boolean(planInput) && (step === 'plan' || step === 'review'),
    staleTime: 60_000,
    retry: false,
  });
  const blockingIssues = (plan.data?.issues ?? []).filter((i) => i.severity === 'error' && i.stage !== 'policy');
  canAdvance.plan = Boolean(plan.data) && blockingIssues.length === 0;

  /** The profile's target for the first provider each slot accepts, with its region. */
  const applyProfile = (next: ProfileDto | null) => {
    setProfileId(next?.id ?? '');
    if (!next || !doc) return;
    setBindings((prev) => {
      const out = { ...prev };
      for (const slot of doc.placements) {
        const entry = slot.providers.length ? slot.providers.map((p) => next.targets.find((e) => e.provider === p)).find(Boolean) : next.targets[0];
        if (entry) out[slot.name] = { targetId: entry.targetId, region: entry.region ?? entry.defaultRegion };
      }
      return out;
    });
    if (next.environment !== 'any') setDetails((d) => ({ ...d, environment: next.environment as Details['environment'] }));
  };

  const create = useMutation({
    mutationFn: (input: CreateInstanceInput) => apiSend<InstanceDto>('POST', '/instances', input),
    onSuccess: (instance) => {
      void qc.invalidateQueries({ queryKey: ['instances'] });
      router.push(`/instances/${instance.id}?tab=plan`);
    },
  });

  if (tenants.isPending || templates.isPending) return <PageSpinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumb={
          <Link href="/instances" className="hover:underline">
            {t('breadcrumb')}
          </Link>
        }
      />

      <ol className="mb-5 flex flex-wrap gap-1.5" aria-label={t('stepsLabel')}>
        {STEPS.map((s, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;
          const reachable = i <= stepIndex || STEPS.slice(0, i).every((p) => canAdvance[p.id]);
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!reachable || current}
                onClick={() => setStep(s.id)}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                  current && 'border-accent bg-accent/10 font-medium text-accent-ink',
                  done && 'border-border text-fg-muted hover:bg-surface-2',
                  !current && !done && 'border-border text-fg-subtle',
                  !reachable && 'opacity-60',
                )}
              >
                <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[10px]', done ? 'bg-ok text-accent-fg' : 'bg-surface-2')}>
                  {done ? <Check size={10} aria-hidden /> : i + 1}
                </span>
                {t(`steps.${s.id}`)}
              </button>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardBody className="py-4">
          {step === 'tenant' ? <TenantStep tenants={tenants.data ?? []} value={tenantId} onChange={setTenantId} error={tenants.error} /> : null}

          {step === 'template' ? (
            <TemplateStep
              templates={templates.data ?? []}
              error={templates.error}
              templateId={templateId}
              onTemplate={(t) => {
                setTemplateId(t.id);
                setVersionId(t.latestPublished?.id ?? '');
              }}
              versions={publishedVersions}
              versionsLoading={template.isFetching}
              versionId={versionId}
              onVersion={setVersionId}
              doc={doc}
            />
          ) : null}

          {step === 'placement' && doc ? (
            <PlacementStep
              slots={doc.placements}
              bindings={bindings}
              setBindings={setBindings}
              eligible={eligibleTargets}
              loading={targets.isPending && !targets.isError}
              error={targets.error}
              profiles={profiles.data ?? []}
              profileId={profileId}
              onProfile={applyProfile}
            />
          ) : null}

          {step === 'variables' && doc ? (
            <VariablesStep vars={doc.variables} values={variables} errors={variableErrors} onChange={(name, value) => setVariables((prev) => ({ ...prev, [name]: value }))} />
          ) : null}

          {step === 'details' ? (
            <DetailsStep
              initial={details}
              nonProduction={doc?.nonProduction ?? false}
              onSubmit={(d) => {
                setDetails(d);
                setStep('plan');
              }}
              onBack={() => go(-1)}
            />
          ) : null}

          {step === 'plan' ? (
            <div className="space-y-4">
              <StepTitle title={t('plan.title')} description={t('plan.hint')} />
              {plan.isPending ? (
                <PageSpinner label={t('plan.loading')} />
              ) : plan.error ? (
                <ErrorNotice error={plan.error} />
              ) : (
                <>
                  {blockingIssues.length > 0 ? <Notice tone="warn">{t('plan.blocking')}</Notice> : null}
                  {plan.data.policyResults.some((p) => p.status === 'fail') ? <Notice tone="info">{t('plan.policyNote')}</Notice> : null}
                  <PreviewReport preview={plan.data} />
                </>
              )}
            </div>
          ) : null}

          {step === 'review' && plan.data ? (
            <p className="mb-3 text-sm font-medium">
              {plan.data.cost.confidence === 'unavailable' ? t('plan.estimateNone') : t('plan.estimate', { amount: fmt.money(plan.data.cost.total) })}
            </p>
          ) : null}

          {step === 'review' && doc && version ? (
            <ReviewStep
              tenant={tenant}
              template={templateSummary}
              version={version}
              doc={doc}
              bindings={bindings}
              targets={targets.data ?? []}
              profile={profile}
              variables={variables}
              details={details}
              issues={parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.') || t('review.request')}: ${i.message}`)}
            />
          ) : null}

          {create.error ? <ErrorNotice error={create.error} title={t('createFailed')} className="mt-4" /> : null}
        </CardBody>

        {step !== 'details' ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
            <Button onClick={() => go(-1)} disabled={stepIndex === 0}>
              {tc('back')}
            </Button>
            {step === 'review' ? (
              <Button variant="primary" disabled={!parsed.success} loading={create.isPending} onClick={() => parsed.success && create.mutate(payload)}>
                {t('create')}
              </Button>
            ) : (
              <Button variant="primary" disabled={!canAdvance[step]} onClick={() => go(1)}>
                {tc('continue')}
              </Button>
            )}
          </div>
        ) : null}
      </Card>
    </>
  );
}

function StepTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="text-xs text-fg-subtle">{description}</p> : null}
    </div>
  );
}

function TenantStep({ tenants, value, onChange, error }: { tenants: TenantDto[]; value: string; onChange: (id: string) => void; error: unknown }) {
  const t = useTranslations('wizard');
  if (error) return <ErrorNotice error={error} />;
  if (tenants.length === 0) return <EmptyState title={t('tenant.noTenantsTitle')} description={t('tenant.noTenantsBody')} />;
  return (
    <fieldset>
      <legend className="sr-only">{t('steps.tenant')}</legend>
      <StepTitle title={t('tenant.title')} description={t('tenant.hint')} />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tenants.map((tenant) => (
          <label
            key={tenant.id}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-md border p-3 hover:bg-surface-2',
              value === tenant.id ? 'border-accent ring-1 ring-accent' : 'border-border',
            )}
          >
            <input type="radio" name="tenant" value={tenant.id} checked={value === tenant.id} onChange={() => onChange(tenant.id)} className="mt-0.5 accent-accent" />
            <span className="min-w-0">
              <span className="block font-medium">{tenant.name}</span>
              <span className="block font-mono text-[11px] text-fg-subtle">{tenant.slug}</span>
              <span className="mt-1 flex gap-1.5">
                <LimitsSummary limits={tenant.limits} />
                <Badge>{t('tenant.instanceCount', { count: tenant.instanceCount })}</Badge>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TemplateStep({
  templates,
  error,
  templateId,
  onTemplate,
  versions,
  versionsLoading,
  versionId,
  onVersion,
  doc,
}: {
  templates: TemplateDto[];
  error: unknown;
  templateId: string;
  onTemplate: (t: TemplateDto) => void;
  versions: TemplateVersionDto[];
  versionsLoading: boolean;
  versionId: string;
  onVersion: (id: string) => void;
  doc: TemplateDocView | null;
}) {
  const t = useTranslations('wizard');
  const fmt = useFormat();
  if (error) return <ErrorNotice error={error} />;
  const published = templates.filter((tpl) => tpl.latestPublished);
  if (published.length === 0) return <EmptyState title={t('template.noneTitle')} description={t('template.noneBody')} />;
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">{t('steps.template')}</legend>
        <StepTitle title={t('template.title')} description={t('template.hint')} />
        <div className="grid gap-2 md:grid-cols-2">
          {published.map((tpl) => {
            const d = readTemplateDoc(tpl.latestPublished!.document);
            return (
              <label
                key={tpl.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-md border p-3 hover:bg-surface-2',
                  templateId === tpl.id ? 'border-accent ring-1 ring-accent' : 'border-border',
                )}
              >
                <input type="radio" name="template" checked={templateId === tpl.id} onChange={() => onTemplate(tpl)} className="mt-0.5 accent-accent" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{tpl.displayName}</span>
                    <span className="font-mono text-[11px] text-fg-subtle">@{tpl.latestPublished!.version}</span>
                    {tpl.visibility === 'SYSTEM' ? <Badge>{t('template.system')}</Badge> : null}
                    {d.nonProduction ? <Badge tone="warn">{t('template.nonProduction')}</Badge> : null}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs text-fg-muted">{tpl.description || d.description}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {d.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                    <Badge>{t('template.placements', { count: d.placements.length })}</Badge>
                    <Badge>{t('template.resources', { count: d.resourceCount })}</Badge>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {templateId ? (
        <div className="space-y-3 border-t border-border pt-4">
          <Field label={t('template.version')} htmlFor="template-version" hint={t('template.versionHint')}>
            <div className="flex items-center gap-2">
              <Select id="template-version" value={versionId} onChange={(e) => onVersion(e.target.value)} className="w-56">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.publishedAt ? t('template.publishedOn', { version: v.version, date: fmt.date(v.publishedAt) }) : v.version}
                  </option>
                ))}
              </Select>
              {versionsLoading ? <Spinner size={14} label={t('template.loadingVersions')} /> : null}
            </div>
          </Field>
          {doc ? (
            <>
              {doc.description ? <p className="text-sm text-fg-muted">{doc.description}</p> : null}
              {doc.nonProduction ? (
                <Notice tone="warn">
                  <span className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn-ink" aria-hidden />
                    <span>
                      <strong>{t('template.notForProductionTitle')}</strong> {t('template.notForProductionBody')}
                    </span>
                  </span>
                </Notice>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


function PlacementStep({
  slots,
  bindings,
  setBindings,
  eligible,
  loading,
  error,
  profiles,
  profileId,
  onProfile,
}: {
  slots: PlacementSlot[];
  bindings: Record<string, Binding>;
  setBindings: (fn: (prev: Record<string, Binding>) => Record<string, Binding>) => void;
  eligible: (slot: PlacementSlot) => CloudTargetDto[];
  loading: boolean;
  error: unknown;
  profiles: ProfileDto[];
  profileId: string;
  onProfile: (profile: ProfileDto | null) => void;
}) {
  const t = useTranslations('wizard.placement');
  const tc = useTranslations('common');
  const envLabel = useEnvironmentLabel();
  const [note, setNote] = useState<string | null>(null);
  const targetLabel = (target: CloudTargetDto): string =>
    target.simulated
      ? t('targetLabelSimulated', { name: target.name, provider: target.provider, simulates: target.simulates ?? t('cloud'), environment: envLabel(target.environment) })
      : t('targetLabel', { name: target.name, provider: target.provider, environment: envLabel(target.environment) });
  if (loading) return <PageSpinner label={t('loadingTargets')} />;
  // Tenant roles cannot list cloud targets: they place an instance with a profile.
  if (error && profiles.length === 0) return <ErrorNotice error={error} />;
  const profileTargets = new Map(profiles.flatMap((p) => p.targets.map((e) => [e.targetId, e.targetName] as const)));

  const first = slots[0];
  const firstBinding = first ? bindings[first.name] : undefined;

  const useSameForAll = () => {
    if (!firstBinding?.targetId) return;
    const compatible = slots.filter((slot) => eligible(slot).some((target) => target.id === firstBinding.targetId));
    const skipped = slots.filter((slot) => !compatible.includes(slot)).map((s) => s.name);
    setBindings((prev) => {
      const next = { ...prev };
      for (const slot of compatible) next[slot.name] = { ...firstBinding };
      return next;
    });
    setNote(skipped.length ? t('skipped', { slots: skipped.join(', ') }) : null);
  };

  return (
    <div className="space-y-4">
      <StepTitle title={t('title')} description={t('hint')} />
      {profiles.length > 0 ? (
        <Field label={t('profile')} htmlFor="wizard-profile" hint={t('profileHint')}>
          <Select id="wizard-profile" value={profileId} onChange={(e) => onProfile(profiles.find((p) => p.id === e.target.value) ?? null)}>
            <option value="">{t('noProfile')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.isDefault ? 'profileDefault' : 'profileOption', { name: p.name, environment: envLabel(p.environment) })}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {slots.length > 1 && !error ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={useSameForAll} disabled={!firstBinding?.targetId}>
            <Copy size={13} aria-hidden /> {t('useSame')}
          </Button>
          <span className="text-xs text-fg-subtle">{t('useSameHint', { slot: first?.name ?? '' })}</span>
        </div>
      ) : null}
      {note ? <Notice tone="warn">{note}</Notice> : null}

      <div className="space-y-3">
        {slots.map((slot) => {
          const options = eligible(slot);
          const binding = bindings[slot.name];
          const target = options.find((o) => o.id === binding?.targetId) ?? null;
          const id = `slot-${slot.name}`;
          return (
            <fieldset key={slot.name} className="rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">
                <span className="font-mono">{slot.name}</span>
              </legend>
              {slot.description ? <p className="mb-2 text-xs text-fg-muted">{slot.description}</p> : null}
              <p className="mb-3 flex flex-wrap items-center gap-1 text-xs text-fg-subtle">
                {t('allowedProviders')}
                {slot.providers.length === 0 ? <Badge>{tc('any')}</Badge> : slot.providers.map((p) => <Badge key={p}>{p}</Badge>)}
              </p>
              {options.length === 0 && binding?.targetId ? (
                <p className="text-sm">{t('fromProfile', { target: profileTargets.get(binding.targetId) ?? binding.targetId, region: binding.region })}</p>
              ) : options.length === 0 ? (
                <Notice tone="warn">
                  {t('noTarget')}{' '}
                  <Link href="/cloud-targets" className="text-accent-ink underline">
                    {t('registerTarget')}
                  </Link>
                </Notice>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                  <Field label={t('target')} htmlFor={`${id}-target`}>
                    <Select
                      id={`${id}-target`}
                      value={binding?.targetId ?? ''}
                      onChange={(e) => {
                        const picked = options.find((o) => o.id === e.target.value);
                        setBindings((prev) => ({ ...prev, [slot.name]: { targetId: e.target.value, region: picked ? picked.defaultRegion || picked.allowedRegions[0] || '' : '' } }));
                      }}
                    >
                      <option value="">{t('selectTarget')}</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {targetLabel(o)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('region')} htmlFor={`${id}-region`}>
                    <Select
                      id={`${id}-region`}
                      value={binding?.region ?? ''}
                      disabled={!target}
                      onChange={(e) => setBindings((prev) => ({ ...prev, [slot.name]: { targetId: binding?.targetId ?? '', region: e.target.value } }))}
                    >
                      {!target ? <option value="">{tc('empty')}</option> : null}
                      {(target?.allowedRegions ?? []).map((r) => (
                        <option key={r} value={r}>
                          {r === target?.defaultRegion ? t('defaultRegion', { region: r }) : r}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
              {target ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <StatusBadge status={target.health} prefix={t('targetHealth')} />
                  {target.simulated ? <SimulatedBadge simulates={target.simulates} /> : null}
                  {target.lastValidation && !target.lastValidation.ok ? <Badge tone="warn">{t('lastValidationFailed')}</Badge> : null}
                </div>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

function VariablesStep({
  vars,
  values,
  errors,
  onChange,
}: {
  vars: TemplateVariable[];
  values: Record<string, VarValue>;
  errors: Record<string, VariableIssue | null>;
  onChange: (name: string, value: VarValue) => void;
}) {
  const t = useTranslations('wizard.variables');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const fmt = useFormat();
  if (vars.length === 0) {
    return (
      <>
        <StepTitle title={t('title')} />
        <p className="text-sm text-fg-muted">{t('none')}</p>
      </>
    );
  }
  const describe = (issue: VariableIssue | null): string | null => {
    if (!issue) return null;
    switch (issue.code) {
      case 'numberTooSmall':
        return tv('numberTooSmall', { minimum: issue.minimum });
      case 'numberTooBig':
        return tv('numberTooBig', { maximum: issue.maximum });
      case 'oneOf':
        return tv('oneOf', { values: issue.values });
      default:
        return tv(issue.code);
    }
  };
  // Advanced settings collapsed by default when every variable has a default (spec §40, §87).
  const simple = vars.every((v) => v.default !== undefined);
  const fields = (
      <div className="grid gap-4 sm:grid-cols-2">
        {vars.map((v) => {
          const id = `var-${v.name}`;
          const value = values[v.name];
          const error = describe(errors[v.name] ?? null);
          const range =
            v.type === 'number' && (v.min !== undefined || v.max !== undefined)
              ? t('range', { min: v.min === undefined ? t('noMin') : fmt.number(v.min), max: v.max === undefined ? t('noMax') : fmt.number(v.max) })
              : null;
          const hint = [v.description, range, tc('defaultValue', { value: String(v.default) })].filter(Boolean).join(' · ');
          if (v.type === 'boolean') {
            return (
              <div key={v.name} className="space-y-1">
                <label htmlFor={id} className="flex items-center gap-2 text-sm">
                  <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(v.name, e.target.checked)} className="accent-accent" />
                  <span className="font-mono text-xs">{v.name}</span>
                </label>
                <p className="text-xs text-fg-subtle">{hint}</p>
              </div>
            );
          }
          return (
            <Field key={v.name} label={<span className="font-mono">{v.name}</span>} htmlFor={id} hint={hint} error={error}>
              {v.type === 'string' && v.allowed && v.allowed.length > 0 ? (
                <Select id={id} value={String(value ?? '')} onChange={(e) => onChange(v.name, e.target.value)} {...describedBy(id, { hint, error })}>
                  {v.allowed.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              ) : v.type === 'number' ? (
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={v.min}
                  max={v.max}
                  value={typeof value === 'number' && !Number.isNaN(value) ? value : ''}
                  onChange={(e) => onChange(v.name, e.target.value === '' ? Number.NaN : Number(e.target.value))}
                  {...describedBy(id, { hint, error })}
                />
              ) : (
                <Input id={id} value={String(value ?? '')} onChange={(e) => onChange(v.name, e.target.value)} {...describedBy(id, { hint, error })} />
              )}
            </Field>
          );
        })}
      </div>
  );
  return (
    <div>
      <StepTitle title={t('configure')} description={t('configureHint')} />
      {simple ? (
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">{t('defaultsFit')}</p>
          <Disclosure summary={t('advanced', { count: vars.length })}>
            <div className="p-3">{fields}</div>
          </Disclosure>
        </div>
      ) : (
        fields
      )}
    </div>
  );
}

const detailsSchema = createInstanceSchema.pick({ name: true, slug: true, environment: true });

function DetailsStep({ initial, nonProduction, onSubmit, onBack }: { initial: Details; nonProduction: boolean; onSubmit: (d: Details) => void; onBack: () => void }) {
  const t = useTranslations('wizard.details');
  const tc = useTranslations('common');
  const envLabel = useEnvironmentLabel();
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const form = useForm({ resolver: useZodResolver(detailsSchema), defaultValues: initial });
  const { errors } = form.formState;
  const env = form.watch('environment');
  const nameField = form.register('name', {
    onChange: (e: { target: { value: string } }) => {
      if (!slugTouched) form.setValue('slug', slugify(e.target.value));
    },
  });

  return (
    <form onSubmit={form.handleSubmit((d) => onSubmit({ name: d.name, slug: d.slug, environment: d.environment }))} noValidate>
      <StepTitle title={t('title')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('name')} htmlFor="inst-name" error={errors.name?.message} required>
          <Input id="inst-name" autoFocus placeholder={t('namePlaceholder')} {...describedBy('inst-name', { error: errors.name })} {...nameField} />
        </Field>
        <Field label={t('slug')} htmlFor="inst-slug" hint={t('slugHint')} error={errors.slug?.message} required>
          <Input id="inst-slug" className="font-mono" {...describedBy('inst-slug', { hint: true, error: errors.slug })} {...form.register('slug', { onChange: () => setSlugTouched(true) })} />
        </Field>
        <Field label={t('environment')} htmlFor="inst-env" error={errors.environment?.message}>
          <Select id="inst-env" {...form.register('environment')}>
            {ENVIRONMENTS.map((e) => (
              <option key={e} value={e}>
                {envLabel(e)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {nonProduction && env === 'production' ? (
        <Notice tone="warn" className="mt-4">
          {t('nonProductionWarning')}
        </Notice>
      ) : null}
      <div className="-mx-4 -mb-4 mt-5 flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <Button onClick={onBack}>{tc('back')}</Button>
        <Button type="submit" variant="primary">
          {tc('continue')}
        </Button>
      </div>
    </form>
  );
}

function ReviewStep({
  tenant,
  template,
  version,
  doc,
  bindings,
  targets,
  profile,
  variables,
  details,
  issues,
}: {
  tenant: TenantDto | null;
  template: TemplateDto | null;
  version: TemplateVersionDto;
  doc: TemplateDocView;
  bindings: Record<string, Binding>;
  targets: CloudTargetDto[];
  profile: ProfileDto | null;
  variables: Record<string, VarValue>;
  details: Details;
  issues: string[];
}) {
  const t = useTranslations('wizard.review');
  const tw = useTranslations('wizard');
  const tc = useTranslations('common');
  const envLabel = useEnvironmentLabel();
  const byId = new Map(targets.map((target) => [target.id, target]));
  const anySimulated = Object.values(bindings).some((b) => byId.get(b.targetId)?.simulated);
  const providers = new Set(Object.values(bindings).map((b) => byId.get(b.targetId)?.provider ?? '?'));
  return (
    <div className="space-y-4">
      <StepTitle title={t('title')} description={t('hint')} />
      {issues.length > 0 ? <ErrorNotice error={new Error(issues.join(' · '))} title={t('invalid')} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('instance')} as="h3" />
          <CardBody>
            <KeyValues
              items={[
                { label: t('tenant'), value: tenant ? tenant.name : tc('empty') },
                { label: t('name'), value: details.name },
                { label: t('slug'), value: <code className="font-mono text-xs">{details.slug}</code> },
                { label: t('environment'), value: envLabel(details.environment) },
                { label: t('profile'), value: profile?.name ?? tc('none') },
                {
                  label: t('template'),
                  value: (
                    <span>
                      {template?.displayName ?? doc.displayName} <span className="font-mono text-xs text-fg-subtle">@{version.version}</span>
                      {doc.nonProduction ? (
                        <Badge tone="warn" className="ml-1.5">
                          {tw('template.nonProduction')}
                        </Badge>
                      ) : null}
                    </span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={t('placement')}
            as="h3"
            actions={
              <>
                {providers.size > 1 ? <Badge tone="info">{t('multicloud')}</Badge> : null}
                {anySimulated ? <SimulatedBadge /> : null}
              </>
            }
          />
          <CardBody>
            <ul className="space-y-1.5 text-sm">
              {doc.placements.map((s) => {
                const b = bindings[s.name];
                const target = b ? byId.get(b.targetId) : undefined;
                return (
                  <li key={s.name} className="flex flex-wrap items-center gap-x-2">
                    <span className="w-20 font-mono text-xs text-fg-subtle">{s.name}</span>
                    <span>{target?.name ?? profile?.targets.find((e) => e.targetId === b?.targetId)?.targetName ?? tc('empty')}</span>
                    <span className="font-mono text-xs text-fg-muted">
                      {target?.provider ?? profile?.targets.find((e) => e.targetId === b?.targetId)?.provider}
                      {target?.simulated ? ` (${target.simulates})` : ''} / {b?.region}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
      {doc.variables.length > 0 ? (
        <Disclosure summary={t('variablesSummary', { count: doc.variables.filter((v) => variables[v.name] !== v.default).length })}>
          <KeyValues
            items={doc.variables.map((v) => ({
              label: <span className="font-mono text-xs">{v.name}</span>,
              value: (
                <span className={cn(variables[v.name] !== v.default && 'font-medium text-accent-ink')}>
                  {String(variables[v.name])}
                  {variables[v.name] !== v.default ? <span className="ml-1 text-xs text-fg-subtle">{t('defaultWas', { value: String(v.default) })}</span> : null}
                </span>
              ),
            }))}
          />
        </Disclosure>
      ) : null}
    </div>
  );
}
