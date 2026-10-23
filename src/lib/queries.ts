// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CloudTargetDto,
  InstanceDto,
  LicenseDto,
  Page,
  ProfileDto,
  TemplateDto,
  TenantDto,
} from '@orkstage/contracts';
import { apiGet, apiGetAll, asItems, qs } from './api';

/** Shared list queries. Lists accept either a bare array or `Page<T>` from the API. */

export function useTenants(enabled = true) {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: ({ signal }) => apiGetAll<TenantDto>('/tenants', { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useTemplates(enabled = true) {
  return useQuery({
    queryKey: ['templates'],
    queryFn: ({ signal }) => apiGetAll<TemplateDto>('/templates', { signal }),
    enabled,
    staleTime: 30_000,
  });
}

export function useTemplate(id: string | null | undefined) {
  return useQuery({
    queryKey: ['template', id],
    queryFn: ({ signal }) => apiGet<TemplateDto>(`/templates/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useCloudTargets(enabled = true) {
  return useQuery({
    queryKey: ['cloud-targets'],
    queryFn: ({ signal }) => apiGetAll<CloudTargetDto>('/cloud/targets', { signal }),
    enabled,
    staleTime: 15_000,
  });
}

export function useInstances(filter: { tenantId?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['instances', filter],
    queryFn: async ({ signal }) =>
      asItems(await apiGet<InstanceDto[] | Page<InstanceDto>>(`/instances${qs({ limit: 100, ...filter })}`, { signal })),
    refetchInterval: 15_000,
  });
}

/** id → name lookup helper for tenant columns. */
export function tenantNameMap(tenants: TenantDto[] | undefined): Map<string, string> {
  return new Map((tenants ?? []).map((t) => [t.id, t.name]));
}

/** Profiles a tenant may use (its own and the shared ones), or every profile the caller sees. */
export function useProfiles(tenantId?: string, enabled = true) {
  return useQuery({
    queryKey: ['profiles', tenantId ?? null],
    queryFn: async ({ signal }) => asItems(await apiGet<ProfileDto[] | Page<ProfileDto>>(`/profiles${tenantId ? qs({ tenantId }) : ''}`, { signal })),
    enabled,
    staleTime: 15_000,
  });
}

/** The edition and licensed features (visibility only: the API enforces Enterprise features). */
export function useLicense() {
  return useQuery({ queryKey: ['license'], queryFn: ({ signal }) => apiGet<LicenseDto>('/license', { signal }), staleTime: 10 * 60_000 });
}
