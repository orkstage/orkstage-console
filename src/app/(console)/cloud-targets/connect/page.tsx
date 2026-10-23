// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import {
  createCloudTargetSchema,
  PROVIDER_FORMS,
  PROVIDERS,
  SECRET_REF_PATTERN,
  TARGET_ENVIRONMENTS,
  type CloudTargetDto,
  type ProviderDto,
} from '@orkstage/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { docsFor, envNameFor, newExternalId, prepareFor, type PrepareInputKey } from '@/components/connect/prepare';
import { docsUrl } from '@/components/getting-started';
import { ChecksList, type Validation } from '@/components/target-checks';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { ErrorNotice, Notice } from '@/components/ui/error-notice';
import { Field, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { PageSpinner } from '@/components/ui/spinner';
import { useEnvironmentLabel } from '@/i18n/labels';
import { useCan } from '@/lib/ability';
import { apiGet, apiSend } from '@/lib/api';
import { useTemplates, useTenants } from '@/lib/queries';
import { cn, splitList } from '@/lib/utils';

type Provider = (typeof PROVIDERS)[number];
type Environment = (typeof TARGET_ENVIRONMENTS)[number];
type StepId = 'provider' | 'prepare' | 'details' | 'review' | 'validate';
const STEPS: StepId[] = ['provider', 'prepare', 'details', 'review', 'validate'];
type SecretStore = 'env' | 'aws-sm';

/**
 * Connect a cloud, step by step (the guided version of "Register target"): choose the provider,
 * prepare the account with commands filled in for you, describe the target, register it and
 * validate it, then go on to a profile and a first deployment.
 */
export default function ConnectCloudPage() {
  const t = useTranslations('connect');
  const can = useCan();
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ['cloud-providers'], queryFn: ({ signal }) => apiGet<ProviderDto[]>('/cloud/providers', { signal }) });

  const [step, setStep] = useState<StepId>('provider');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [inputs, setInputs] = useState<Partial<Record<PrepareInputKey, string>>>({});
  const [externalId, setExternalId] = useState('');
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<Environment>('development');
  const [tenantId, setTenantId] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [store, setStore] = useState<SecretStore>('env');
  const [credentialRef, setCredentialRef] = useState('');
  const [regions, setRegions] = useState('');
  const [defaultRegion, setDefaultRegion] = useState('');
  const [created, setCreated] = useState<CloudTargetDto | null>(null);

  useEffect(() => setExternalId(newExternalId()), []);

  const prep = provider ? prepareFor(provider) : null;
  const form = provider ? PROVIDER_FORMS[provider] : null;
  const envName = provider ? envNameFor(provider, name || `${provider} ${environment}`, provider === 'aws' ? 'EXTERNAL_ID' : '') : '';
  const values = { inputs, externalId, envName };
  const suggestedRef = provider === 'aws' && store === 'aws-sm' ? `aws-sm://orkstage/aws/${inputs.accountId || 'ACCOUNT_ID'}-external-id` : `env://${envName}`;

  /** Carries what the prepare step knows into the details, without overwriting what was typed. */
  const enterDetails = () => {
    if (!provider) return;
    const p = prepareFor(provider);
    if (p) {
      setConfig((c) => ({ ...p.config(values), ...Object.fromEntries(Object.entries(c).filter(([, v]) => v)) }));
      if (!regions) setRegions(p.regions(values));
    }
    if (!name) setName(`${provider}-${environment}`);
    if (!credentialRef) setCredentialRef(suggestedRef);
    setStep('details');
  };

  const regionList = splitList(regions);
  const fieldErrors = form
    ? Object.fromEntries(
        form.config.map((f) => {
          const v = (config[f.key] ?? '').trim();
          if (!v && f.required) return [f.key, t('required')];
          if (v && f.pattern && !new RegExp(f.pattern).test(v)) return [f.key, t('format', { example: f.example })];
          return [f.key, null];
        }),
      )
    : {};
  const needsCredential = Boolean(form?.credentialFields.length);
  const detailsOk =
    !!provider &&
    name.trim().length >= 2 &&
    Object.values(fieldErrors).every((e) => e === null) &&
    (!needsCredential || SECRET_REF_PATTERN.test(credentialRef)) &&
    regionList.length > 0 &&
    (!defaultRegion || regionList.includes(defaultRegion));

  const body = provider
    ? {
        provider,
        name: name.trim(),
        environment,
        config: Object.fromEntries(Object.entries(config).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])),
        ...(needsCredential ? { credentialRef } : {}),
        allowedRegions: regionList,
        defaultRegion: defaultRegion || regionList[0] || '',
        ...(tenantId ? { tenantId } : {}),
      }
    : null;

  const register = useMutation({
    mutationFn: async () => {
      if (!body) throw new Error('No provider');
      if (created) {
        const { name: n, config: c, allowedRegions, defaultRegion: d } = body;
        return apiSend<CloudTargetDto>('PATCH', `/cloud/targets/${created.id}`, { name: n, config: c, allowedRegions, defaultRegion: d, ...(needsCredential ? { credentialRef } : {}) });
      }
      return apiSend<CloudTargetDto>('POST', '/cloud/targets', createCloudTargetSchema.parse(body));
    },
    onSuccess: (target) => {
      setCreated(target);
      void qc.invalidateQueries({ queryKey: ['cloud-targets'] });
      setStep('validate');
    },
  });

  const canAdvance: Record<StepId, boolean> = {
    provider: !!provider && !!providers.data?.find((p) => p.provider === provider)?.enabled,
    prepare: true,
    details: detailsOk,
    review: !!created,
    validate: true,
  };
  const index = STEPS.indexOf(step);

  if (providers.isPending) return <PageSpinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumb={
          <Link href="/cloud-targets" className="hover:underline">
            {t('breadcrumb')}
          </Link>
        }
      />
      <ol className="mb-5 flex flex-wrap gap-1.5" aria-label={t('stepsLabel')}>
        {STEPS.map((s, i) => {
          const current = s === step;
          const passed = i < index;
          const reachable = i <= index || STEPS.slice(0, i).every((p) => canAdvance[p]);
          return (
            <li key={s}>
              <button
                type="button"
                disabled={!reachable || current || (s === 'validate' && !created)}
                onClick={() => (s === 'details' ? enterDetails() : setStep(s))}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                  current && 'border-accent bg-accent/10 font-medium text-accent-ink',
                  passed && 'border-border text-fg-muted hover:bg-surface-2',
                  !current && !passed && 'border-border text-fg-subtle',
                  !reachable && 'opacity-60',
                )}
              >
                <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[10px]', passed ? 'bg-ok text-accent-fg' : 'bg-surface-2')}>
                  {passed ? <Check size={10} aria-hidden /> : i + 1}
                </span>
                {t(`steps.${s}`)}
              </button>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardBody className="space-y-4 py-4">
          {providers.error ? <ErrorNotice error={providers.error} /> : null}

          {step === 'provider' ? (
            <ProviderStep
              providers={providers.data ?? []}
              value={provider}
              locked={!!created}
              canEnable={can('manage', 'Settings')}
              onChange={(p) => {
                setProvider(p);
                setInputs({});
                setConfig({});
                setRegions('');
                setDefaultRegion('');
                setCredentialRef('');
                setDone({});
              }}
              onEnabled={() => void qc.invalidateQueries({ queryKey: ['cloud-providers'] })}
            />
          ) : null}

          {step === 'prepare' && provider ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">{t('prepare.intro')}</p>
              {prep ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {prep.inputs.map((input) => {
                      const v = inputs[input.key] ?? '';
                      const bad = v && input.pattern && !new RegExp(input.pattern).test(v);
                      return (
                        <Field key={input.key} label={t(`prepare.inputs.${input.key}`)} htmlFor={`prep-${input.key}`} error={bad ? t('format', { example: input.example }) : undefined}>
                          <Input
                            id={`prep-${input.key}`}
                            className="font-mono"
                            autoComplete="off"
                            placeholder={input.example}
                            value={v}
                            onChange={(e) => setInputs((prev) => ({ ...prev, [input.key]: e.target.value.trim() }))}
                          />
                        </Field>
                      );
                    })}
                  </div>
                  {provider === 'aws' ? (
                    <Notice tone="info">
                      <span className="flex flex-wrap items-center gap-2">
                        {t('prepare.externalId')}
                        <Button size="sm" variant="ghost" onClick={() => setExternalId(newExternalId())}>
                          <RefreshCw size={12} aria-hidden /> {t('prepare.regenerate')}
                        </Button>
                      </span>
                    </Notice>
                  ) : null}
                  <ol className="space-y-3">
                    {prep.steps(values).map((s, i) => (
                      <li key={s.id} className="rounded-md border border-border p-3">
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={!!done[s.id]}
                            onChange={(e) => setDone((d) => ({ ...d, [s.id]: e.target.checked }))}
                          />
                          <span>
                            <span className="block text-sm font-medium">
                              {i + 1}. {t(`prepare.steps.${s.id}.title`)}
                            </span>
                            <span className="block text-xs text-fg-muted">{t(`prepare.steps.${s.id}.body`)}</span>
                          </span>
                        </label>
                        {s.code ? (
                          <div className="mt-2 flex items-start gap-2">
                            <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-surface-2 p-2 font-mono text-[11px] leading-relaxed">{s.code}</pre>
                            <CopyButton value={s.code} />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <Notice tone="info">{provider === 'mock' ? t('prepare.nothing') : t('prepare.followDocs', { fields: PROVIDER_FORMS[provider].credentialFields.join(', ') })}</Notice>
              )}
              <a href={docsUrl(prep?.docs ?? docsFor(provider))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-ink underline">
                <BookOpen size={12} aria-hidden /> {t('prepare.docs')}
              </a>
            </div>
          ) : null}

          {step === 'details' && provider && form ? (
            <DetailsStep
              provider={provider}
              locked={!!created}
              name={name}
              setName={setName}
              environment={environment}
              setEnvironment={setEnvironment}
              tenantId={tenantId}
              setTenantId={setTenantId}
              config={config}
              setConfig={setConfig}
              errors={fieldErrors}
              store={store}
              setStore={(s) => {
                setStore(s);
                setCredentialRef(s === 'aws-sm' ? `aws-sm://orkstage/aws/${inputs.accountId || config.accountId || 'ACCOUNT_ID'}-external-id` : `env://${envName}`);
              }}
              credentialRef={credentialRef}
              setCredentialRef={setCredentialRef}
              regions={regions}
              setRegions={setRegions}
              defaultRegion={defaultRegion}
              setDefaultRegion={setDefaultRegion}
            />
          ) : null}

          {step === 'review' && body ? (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">{created ? t('review.update') : t('review.intro')}</p>
              <pre className="overflow-x-auto rounded bg-surface-2 p-3 font-mono text-xs">{JSON.stringify(body, null, 2)}</pre>
              {register.error ? <ErrorNotice error={register.error} /> : null}
            </div>
          ) : null}

          {step === 'validate' && created ? <ValidateStep target={created} onEdit={() => setStep('details')} /> : null}
        </CardBody>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button disabled={index === 0 || step === 'validate'} onClick={() => setStep(STEPS[index - 1]!)}>
            {t('back')}
          </Button>
          {step === 'review' ? (
            <Button variant="primary" loading={register.isPending} onClick={() => register.mutate()}>
              {created ? t('review.save') : t('review.register')}
            </Button>
          ) : step === 'validate' ? null : (
            <Button
              variant="primary"
              disabled={!canAdvance[step]}
              onClick={() => (step === 'prepare' ? enterDetails() : setStep(STEPS[index + 1]!))}
            >
              {t('continue')}
            </Button>
          )}
        </div>
      </Card>
    </>
  );
}

function ProviderStep({
  providers,
  value,
  locked,
  canEnable,
  onChange,
  onEnabled,
}: {
  providers: ProviderDto[];
  value: Provider | null;
  locked: boolean;
  canEnable: boolean;
  onChange: (p: Provider) => void;
  onEnabled: () => void;
}) {
  const t = useTranslations('connect');
  const enable = useMutation({
    mutationFn: (p: string) => apiSend('PUT', `/feature-flags/PROVIDER_${p.toUpperCase()}`, { enabled: true }),
    onSuccess: onEnabled,
  });
  const order = (p: ProviderDto) => (p.kind === 'infrastructure' ? 0 : p.kind === 'platform' ? 1 : 2);
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">{t('provider.intro')}</p>
      {locked ? <Notice tone="info">{t('provider.locked')}</Notice> : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...providers].sort((a, b) => order(a) - order(b)).map((p) => {
          const selected = value === p.provider;
          return (
            <div key={p.provider} className={cn('rounded-md border p-3', selected ? 'border-accent bg-accent/5' : 'border-border')}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="provider"
                  className="mt-1"
                  checked={selected}
                  disabled={locked}
                  onChange={() => onChange(p.provider as Provider)}
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {p.displayName}
                    <Badge>{t(`provider.kinds.${p.kind}`)}</Badge>
                    {p.enabled ? null : <Badge tone="warn">{t('provider.off')}</Badge>}
                  </span>
                  <span className="block text-xs text-fg-subtle">{t(`provider.kindHints.${p.kind}`)}</span>
                </span>
              </label>
              {!p.enabled && selected ? (
                <div className="mt-2 text-xs text-fg-muted">
                  {canEnable ? (
                    <Button size="sm" loading={enable.isPending} onClick={() => enable.mutate(p.provider)}>
                      {t('provider.enable')}
                    </Button>
                  ) : (
                    t('provider.askOwner')
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {enable.error ? <ErrorNotice error={enable.error} /> : null}
    </div>
  );
}

function DetailsStep(props: {
  provider: Provider;
  locked: boolean;
  name: string;
  setName: (v: string) => void;
  environment: Environment;
  setEnvironment: (v: Environment) => void;
  tenantId: string;
  setTenantId: (v: string) => void;
  config: Record<string, string>;
  setConfig: (f: (c: Record<string, string>) => Record<string, string>) => void;
  errors: Record<string, string | null>;
  store: SecretStore;
  setStore: (s: SecretStore) => void;
  credentialRef: string;
  setCredentialRef: (v: string) => void;
  regions: string;
  setRegions: (v: string) => void;
  defaultRegion: string;
  setDefaultRegion: (v: string) => void;
}) {
  const t = useTranslations('connect');
  const envLabel = useEnvironmentLabel();
  const tenants = useTenants();
  const form = PROVIDER_FORMS[props.provider];
  const regionList = splitList(props.regions);
  const refOk = SECRET_REF_PATTERN.test(props.credentialRef);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('details.name')} htmlFor="cn-name" required>
          <Input id="cn-name" value={props.name} onChange={(e) => props.setName(e.target.value)} />
        </Field>
        <Field label={t('details.environment')} htmlFor="cn-env" hint={props.locked ? t('details.fixedAfterRegister') : t('details.environmentHint')}>
          <Select id="cn-env" value={props.environment} disabled={props.locked} onChange={(e) => props.setEnvironment(e.target.value as Environment)}>
            {TARGET_ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {envLabel(env)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('details.scope')} htmlFor="cn-scope" hint={t('details.scopeHint')}>
          <Select id="cn-scope" value={props.tenantId} disabled={props.locked} onChange={(e) => props.setTenantId(e.target.value)}>
            <option value="">{t('details.shared')}</option>
            {(tenants.data ?? []).map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {form.config.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {form.config.map((f) => (
            <Field key={f.key} label={<code className="font-mono">{f.key}</code>} htmlFor={`cn-cfg-${f.key}`} error={props.errors[f.key] ?? undefined} required={f.required}>
              <Input
                id={`cn-cfg-${f.key}`}
                className="font-mono"
                autoComplete="off"
                placeholder={f.defaultValue ?? f.example}
                value={props.config[f.key] ?? ''}
                readOnly={props.locked && f.fixed}
                onChange={(e) => props.setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      ) : null}

      {form.credentialFields.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {props.provider === 'aws' ? (
            <Field label={t('details.store')} htmlFor="cn-store">
              <Select id="cn-store" value={props.store} onChange={(e) => props.setStore(e.target.value as SecretStore)}>
                <option value="env">{t('details.storeEnv')}</option>
                <option value="aws-sm">{t('details.storeSm')}</option>
              </Select>
            </Field>
          ) : null}
          <Field
            label={t('details.credential')}
            htmlFor="cn-cred"
            className={props.provider === 'aws' ? 'sm:col-span-2' : 'sm:col-span-3'}
            hint={t('details.credentialHint', { fields: form.credentialFields.join(', ') })}
            error={props.credentialRef && !refOk ? t('details.credentialFormat') : undefined}
            required
          >
            <Input id="cn-cred" className="font-mono" autoComplete="off" value={props.credentialRef} onChange={(e) => props.setCredentialRef(e.target.value.trim())} />
          </Field>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('details.regions')} htmlFor="cn-regions" hint={t('details.regionsHint')} required>
          <Input id="cn-regions" className="font-mono" placeholder={form.regionsExample} value={props.regions} onChange={(e) => props.setRegions(e.target.value)} />
        </Field>
        <Field label={t('details.defaultRegion')} htmlFor="cn-default">
          <Select id="cn-default" value={props.defaultRegion} onChange={(e) => props.setDefaultRegion(e.target.value)}>
            <option value="">{regionList[0] ? t('details.firstRegion', { region: regionList[0] }) : ''}</option>
            {regionList.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  );
}

function ValidateStep({ target, onEdit }: { target: CloudTargetDto; onEdit: () => void }) {
  const t = useTranslations('connect');
  const qc = useQueryClient();
  const templates = useTemplates();
  const starter = templates.data?.find((tpl) => tpl.name === 'portable-starter' && tpl.latestPublished);
  const validate = useMutation({
    mutationFn: async () => {
      const res = await apiSend<Validation | CloudTargetDto>('POST', `/cloud/targets/${target.id}/validate`, {});
      return 'checks' in res ? res : res.lastValidation;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['cloud-targets'] }),
  });
  const { mutate } = validate;
  // biome-ignore lint/correctness/useExhaustiveDependencies: validate again when the target changes.
  useEffect(() => mutate(), [mutate, target.id]);
  const result = validate.data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">{t('validate.intro', { name: target.name })}</p>
      {validate.isPending ? <PageSpinner label={t('validate.running')} /> : null}
      {validate.error ? <ErrorNotice error={validate.error} /> : null}
      {result ? <ChecksList validation={result} /> : null}
      {result && !result.ok ? (
        <Notice tone="warn">
          <span className="flex flex-wrap items-center gap-2">
            {t('validate.failed')}
            <Button size="sm" onClick={() => validate.mutate()}>
              <RefreshCw size={12} aria-hidden /> {t('validate.again')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              {t('validate.edit')}
            </Button>
          </span>
        </Notice>
      ) : null}
      {result?.ok ? (
        <div className="space-y-2">
          <Notice tone="info">{t('validate.passed')}</Notice>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/profiles" variant="primary" size="sm">
              {t('validate.profile')}
            </ButtonLink>
            {starter ? (
              <ButtonLink href={`/instances/new?template=${starter.id}`} size="sm">
                {t('validate.starter')}
              </ButtonLink>
            ) : null}
            <ButtonLink href="/cloud-targets" size="sm" variant="ghost">
              {t('validate.targets')}
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
