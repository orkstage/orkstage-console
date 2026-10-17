// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What to prepare in a provider account before OrkStage can use it, as commands filled in with the
 * values the person types in the wizard. The commands mirror the provider pages of the docs
 * (orkstage.io/docs/providers/ and self-hosting/connect-aws); keep both in step.
 */

export type PrepareInputKey = 'accountId' | 'principalArn' | 'region' | 'subscriptionId' | 'location' | 'stateStorageAccount' | 'compartmentOcid';

export interface PrepareInput {
  key: PrepareInputKey;
  example: string;
  pattern?: string;
}

export type PrepareStepId =
  | 'awsIdentity'
  | 'awsRole'
  | 'awsBucket'
  | 'awsSecret'
  | 'azurePrincipal'
  | 'azureState'
  | 'azureSecret'
  | 'ociKey'
  | 'ociPolicies'
  | 'ociState'
  | 'ociSecret';

export interface PrepareStep {
  /** Message key under connect.prepare.steps. */
  id: PrepareStepId;
  code?: string;
}

export interface PrepareValues {
  inputs: Partial<Record<PrepareInputKey, string>>;
  /** Random AWS external id generated in the browser; never sent anywhere but the commands. */
  externalId: string;
  /** Environment variable that will hold the secret on the development stack. */
  envName: string;
}

export interface ProviderPrepare {
  inputs: PrepareInput[];
  steps: (v: PrepareValues) => PrepareStep[];
  /** Config the wizard can fill from the inputs. */
  config: (v: PrepareValues) => Record<string, string>;
  /** Regions to start with. */
  regions: (v: PrepareValues) => string;
  /** Docs page under orkstage.io/docs/. */
  docs: string;
}

const ROLE_TEMPLATE_URL = 'https://raw.githubusercontent.com/orkstage/orkstage/main/infra/aws/orkstage-deployment-role.yaml';
const or = (value: string | undefined, placeholder: string) => (value?.trim() ? value.trim() : placeholder);

/** 24 random bytes as hex: an AWS external id. */
export function newExternalId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `ORKSTAGE_<PROVIDER>_<NAME>`: a name the env:// resolver accepts (no reserved prefix). */
export function envNameFor(provider: string, name: string, suffix = ''): string {
  const p = provider.toUpperCase();
  // "aws-prod" for aws gives ORKSTAGE_AWS_PROD, not ORKSTAGE_AWS_AWS_PROD.
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(new RegExp(`^${p}(_|$)`), '');
  return ['ORKSTAGE', p, slug || 'TARGET', suffix].filter(Boolean).join('_');
}

const aws: ProviderPrepare = {
  inputs: [
    { key: 'accountId', example: '123456789012', pattern: '^\\d{12}$' },
    { key: 'principalArn', example: 'arn:aws:iam::111122223333:role/orkstage-control-plane', pattern: '^arn:aws[a-z-]*:iam::\\d{12}:(role|user)/.+$' },
    { key: 'region', example: 'us-east-1', pattern: '^[a-z]{2}(-[a-z]+)+-\\d$' },
  ],
  steps: (v) => {
    const account = or(v.inputs.accountId, '<ACCOUNT_ID>');
    const region = or(v.inputs.region, 'us-east-1');
    const bucket = `orkstage-tfstate-${account}-${region}`;
    const location = region === 'us-east-1' ? '' : ` \\\n  --create-bucket-configuration LocationConstraint=${region}`;
    return [
      { id: 'awsIdentity' },
      {
        id: 'awsRole',
        code: [
          `curl -fsSLO ${ROLE_TEMPLATE_URL}`,
          'aws cloudformation deploy --stack-name orkstage-deployment-role \\',
          '  --template-file orkstage-deployment-role.yaml --capabilities CAPABILITY_NAMED_IAM \\',
          `  --parameter-overrides ControlPlanePrincipalArn=${or(v.inputs.principalArn, '<CONTROL_PLANE_ARN>')} ExternalId=${v.externalId}`,
        ].join('\n'),
      },
      {
        id: 'awsBucket',
        code: [
          `B=${bucket}`,
          `aws s3api create-bucket --bucket "$B" --region ${region}${location}`,
          'aws s3api put-bucket-versioning --bucket "$B" --versioning-configuration Status=Enabled',
          `aws s3api put-bucket-encryption --bucket "$B" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'`,
          'aws s3api put-public-access-block --bucket "$B" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true',
        ].join('\n'),
      },
      {
        id: 'awsSecret',
        code: [
          '# Development stack: .env.local at the workspace root, then restart api and worker',
          `${v.envName}=${v.externalId}`,
          '',
          "# Or AWS Secrets Manager, in the account of OrkStage's own identity",
          `aws secretsmanager create-secret --name orkstage/aws/${account}-external-id --secret-string '${v.externalId}'`,
        ].join('\n'),
      },
    ];
  },
  config: (v) => ({
    ...(v.inputs.accountId ? { accountId: v.inputs.accountId, roleArn: `arn:aws:iam::${v.inputs.accountId}:role/orkstage-deploy` } : {}),
  }),
  regions: (v) => or(v.inputs.region, 'us-east-1'),
  docs: 'self-hosting/connect-aws/',
};

const azure: ProviderPrepare = {
  inputs: [
    { key: 'subscriptionId', example: '00000000-0000-0000-0000-000000000000', pattern: '^[0-9a-fA-F-]{36}$' },
    { key: 'location', example: 'eastus', pattern: '^[a-z0-9]+$' },
    { key: 'stateStorageAccount', example: 'orkstagestate1234', pattern: '^[a-z0-9]{3,24}$' },
  ],
  steps: (v) => {
    const sub = or(v.inputs.subscriptionId, '<SUBSCRIPTION_ID>');
    const location = or(v.inputs.location, 'eastus');
    const account = or(v.inputs.stateStorageAccount, '<STATE_ACCOUNT>');
    return [
      {
        id: 'azurePrincipal',
        code: [
          `az account set --subscription ${sub}`,
          `az ad sp create-for-rbac --name orkstage-deployer --role Contributor --scopes /subscriptions/${sub}`,
          '# Keep appId (clientId), password (clientSecret) and tenant (tenantId) from the output',
          'APP_ID=<appId>',
          `az role assignment create --assignee "$APP_ID" --role "User Access Administrator" --scope /subscriptions/${sub}`,
        ].join('\n'),
      },
      {
        id: 'azureState',
        code: [
          `az group create --name orkstage-state --location ${location}`,
          `az storage account create --name ${account} --resource-group orkstage-state --location ${location} \\`,
          '  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false --allow-shared-key-access false',
          `az storage account blob-service-properties update --account-name ${account} --resource-group orkstage-state \\`,
          '  --enable-versioning true --enable-delete-retention true --delete-retention-days 30',
          `az storage container create --name orkstage-tfstate --account-name ${account} --auth-mode login`,
          `az role assignment create --assignee "$APP_ID" --role "Storage Blob Data Contributor" \\`,
          `  --scope /subscriptions/${sub}/resourceGroups/orkstage-state/providers/Microsoft.Storage/storageAccounts/${account}`,
        ].join('\n'),
      },
      {
        id: 'azureSecret',
        code: ['# Development stack: .env.local at the workspace root, then restart api and worker', `${v.envName}={"clientSecret":"<password from the first step>"}`].join('\n'),
      },
    ];
  },
  config: (v) => ({
    ...(v.inputs.subscriptionId ? { subscriptionId: v.inputs.subscriptionId } : {}),
    stateResourceGroup: 'orkstage-state',
    ...(v.inputs.stateStorageAccount ? { stateStorageAccount: v.inputs.stateStorageAccount } : {}),
  }),
  regions: (v) => or(v.inputs.location, 'eastus'),
  docs: 'providers/azure/',
};

const oci: ProviderPrepare = {
  inputs: [
    { key: 'region', example: 'us-ashburn-1', pattern: '^[a-z]{2}-[a-z]+-\\d$' },
    { key: 'compartmentOcid', example: 'ocid1.compartment.oc1..aaaa', pattern: '^ocid1\\.(compartment|tenancy)\\.' },
  ],
  steps: (v) => {
    const compartment = or(v.inputs.compartmentOcid, '<COMPARTMENT_OCID>');
    return [
      {
        id: 'ociKey',
        code: ['oci setup keys', 'oci iam user api-key upload --user-id <USER_OCID> --key-file ~/.oci/oci_api_key_public.pem', '# Keep the fingerprint it prints'].join('\n'),
      },
      {
        id: 'ociPolicies',
        code: [
          'Allow group OrkStage to read compartments in tenancy',
          ...['virtual-network-family', 'compute-container-family', 'load-balancers', 'object-family', 'vaults', 'keys', 'secret-family'].map(
            (r) => `Allow group OrkStage to manage ${r} in compartment id ${compartment}`,
          ),
        ].join('\n'),
      },
      {
        id: 'ociState',
        code: [
          'oci os ns get',
          `oci os bucket create --compartment-id <S3_COMPARTMENT_OCID> --name orkstage-state --versioning Enabled`,
          'oci iam customer-secret-key create --user-id <USER_OCID> --display-name orkstage-state',
          '# Keep id (access key id) and key (secret, shown once)',
        ].join('\n'),
      },
      {
        id: 'ociSecret',
        code: [
          '# Development stack: appends one line to .env.local, then restart api and worker',
          `python3 -c 'import json,os; print("${v.envName}=" + json.dumps({"privateKey": open(os.path.expanduser("~/.oci/oci_api_key.pem")).read(), "stateAccessKeyId": "<id>", "stateSecretAccessKey": "<key>"}))' >> .env.local`,
        ].join('\n'),
      },
    ];
  },
  config: (v) => ({ ...(v.inputs.compartmentOcid ? { compartmentOcid: v.inputs.compartmentOcid } : {}), stateBucket: 'orkstage-state' }),
  regions: (v) => or(v.inputs.region, 'us-ashburn-1'),
  docs: 'providers/oci/',
};

const PREPARE: Record<string, ProviderPrepare> = { aws, azure, oci };

/** Providers without a guided preparation get their docs page and the secret's fields. */
export function prepareFor(provider: string): ProviderPrepare | null {
  return PREPARE[provider] ?? null;
}

export const DOCS_FOR: Record<string, string> = {
  aws: 'self-hosting/connect-aws/',
  mock: 'get-started/quickstart/',
};
export const docsFor = (provider: string) => DOCS_FOR[provider] ?? `providers/${provider}/`;
