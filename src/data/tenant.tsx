import { createContext, Fragment, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { clearCache, type Variables } from './client';
import { useQuery, type UseQueryOptions, type UseQueryResult } from './useQuery';
import { useMutation, type UseMutationOptions, type UseMutationResult } from './useMutation';

export const TENANTS = ['tenant-alpha', 'tenant-beta'] as const;

type TenantContextValue = {
  tenantId: string;
  setTenantId: (tenantId: string) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children, initialTenant = TENANTS[0] }: { children: ReactNode; initialTenant?: string }) {
  const [tenantId, setTenant] = useState<string>(initialTenant);

  const setTenantId = useCallback(
    (next: string) => {
      if (next === tenantId) return;
      // Done in the event handler, before React renders the new tenant: abort the old
      // tenant's in-flight requests and drop its cached data so nothing can land late.
      clearCache();
      setTenant(next);
    },
    [tenantId],
  );

  const value = useMemo(() => ({ tenantId, setTenantId }), [tenantId, setTenantId]);

  return (
    <TenantContext.Provider value={value}>
      {/* Keyed on tenant: every hook and every bit of local UI state (search, page,
          selected device) starts empty, so there's no frame showing the old tenant. */}
      <Fragment key={tenantId}>{children}</Fragment>
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  // Loud failure on purpose: the alternative is a request without a tenantId.
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}

type WithTenant<T> = T & { tenantId: string };

export function useTenantQuery<TData, TVars extends Variables = Variables>(
  query: string,
  options: UseQueryOptions<TVars> = {},
): UseQueryResult<TData, TVars> {
  const { tenantId } = useTenant();
  // tenantId goes last so a call site can't override it, even by accident.
  const variables = { ...(options.variables as TVars), tenantId };
  const result = useQuery<TData, WithTenant<TVars>>(query, { ...options, variables });

  const { refetch } = result;
  const tenantRefetch = useCallback(
    (vars?: TVars, replace?: boolean) => refetch({ ...(vars as TVars), tenantId }, replace),
    [refetch, tenantId],
  );

  return { ...result, refetch: tenantRefetch };
}

export function useTenantMutation<TData, TVars extends Variables = Variables>(
  query: string,
  options: UseMutationOptions<TVars> = {},
): UseMutationResult<TData, TVars> {
  const { tenantId } = useTenant();
  const result = useMutation<TData, WithTenant<TVars>>(query, {
    ...options,
    variables: options.variables && { ...options.variables, tenantId },
  });

  const { mutateData } = result;
  const tenantMutate = useCallback(
    (vars?: TVars, replace?: boolean) => mutateData({ ...(vars as TVars), tenantId }, replace),
    [mutateData, tenantId],
  );

  return { ...result, mutateData: tenantMutate };
}
