import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  cacheKey,
  cancelQueries,
  errorMessage,
  fetchQuery,
  isAbortError,
  isFresh,
  operationName,
  peek,
  stableStringify,
  subscribe,
  type Variables,
} from './client';

export type UseQueryResult<TData, TVars> = {
  loading: boolean;
  errors: string[];
  data: TData | undefined;
  refetch: (variables?: TVars, replace?: boolean) => Promise<void>;
  reset: (queryKey?: string) => void;
};

export type UseQueryOptions<TVars> = {
  variables?: TVars;
  /** When true, fire on mount and whenever variables change (compared by value). */
  fetchFirst?: boolean;
  /** Stable handle for cancellation / invalidation. Defaults to the operation name. */
  queryKey?: string;
};

type State = {
  /**
   * Cache key of the response currently on screen. The hook doesn't keep its own
   * copy of the data; it reads it through the cache, so optimistic patches and
   * invalidations reach every hook showing that entry.
   */
  shownKey: string | null;
  loading: boolean;
  errors: string[];
};

export function useQuery<TData, TVars extends Variables = Variables>(
  query: string,
  options: UseQueryOptions<TVars> = {},
): UseQueryResult<TData, TVars> {
  const { fetchFirst = false } = options;
  const queryKey = options.queryKey ?? operationName(query);

  // Callers pass a fresh object literal every render; compare by value or we'd loop.
  const varsHash = stableStringify(options.variables ?? {});
  const variables = useMemo(() => JSON.parse(varsHash) as TVars, [varsHash]);

  const [state, setState] = useState<State>({ shownKey: null, loading: fetchFirst, errors: [] });
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const latestRequestId = useRef(0);
  const currentVars = useRef(variables);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (vars: TVars, force: boolean) => {
      // Every request this hook issues gets an id; only the newest may write state.
      const requestId = ++latestRequestId.current;
      const key = cacheKey(query, vars);

      const cached = peek(key);
      if (!force && cached && isFresh(cached)) {
        setState({ shownKey: key, loading: false, errors: [] });
        return;
      }

      // Decision: a refetch does NOT clear data. The previous response stays on screen
      // (no flicker per keystroke) and `loading` says it's being replaced. That's only
      // safe because a tenant switch remounts the tree (see TenantProvider), so the
      // "previous" response can never belong to a different tenant.
      setState((s) => ({ ...s, loading: true }));

      try {
        const result = await fetchQuery<TData>(query, vars, { queryKey, force });
        // This is what closes the race: a slower, older response resolving after a
        // newer one is simply dropped. (It still lands in its own cache entry, which
        // is harmless and makes going back to that search instant.)
        if (requestId !== latestRequestId.current || !mounted.current) return;
        // data and errors are kept side by side: a partial response shows both.
        setState({ shownKey: key, loading: false, errors: result.errors });
      } catch (err) {
        if (requestId !== latestRequestId.current || !mounted.current) return;
        if (isAbortError(err)) {
          setState((s) => ({ ...s, loading: false }));
          return;
        }
        // Transport failure for *these* variables: don't keep showing rows for other ones.
        setState((s) => ({ shownKey: s.shownKey === key ? key : null, loading: false, errors: [errorMessage(err)] }));
      }
    },
    [query, queryKey],
  );

  useEffect(() => {
    currentVars.current = variables;
    if (fetchFirst) void run(variables, false);
  }, [variables, fetchFirst, run]);

  // Re-render when the entry we're showing changes (optimistic patch, rollback, invalidation).
  useEffect(() => (state.shownKey ? subscribe(state.shownKey, rerender) : undefined), [state.shownKey]);

  const refetch = useCallback(
    async (vars?: TVars, replace = false) => {
      const next = (replace ? (vars ?? {}) : { ...currentVars.current, ...vars }) as TVars;
      currentVars.current = next;
      await run(next, true);
    },
    [run],
  );

  const reset = useCallback(
    (key: string = queryKey) => {
      latestRequestId.current++; // anything this hook has in flight can no longer land
      cancelQueries(key);
      setState({ shownKey: null, loading: false, errors: [] });
    },
    [queryKey],
  );

  const data = state.shownKey ? (peek(state.shownKey)?.result?.data as TData | undefined) : undefined;

  return { loading: state.loading, errors: state.errors, data, refetch, reset };
}
