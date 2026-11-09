/**
 * Transport + module-level request cache.
 *
 * Deliberately small: one Map of entries keyed on (query document + variables).
 * Each entry also keeps its queryKey and variables as plain fields so that
 * invalidation can ask questions like "which entries are DeviceDetail for dev-0042?"
 * instead of only being able to clear by string key.
 */

export const GRAPHQL_ENDPOINT = 'http://localhost:3000/graphql';

/**
 * 30s. Long enough that paging back and forth or re-opening a device is instant
 * and doesn't hammer the API; short enough that device state changed by *another*
 * operator doesn't sit on screen for long. Our own mutations invalidate explicitly,
 * so the TTL only bounds staleness caused by other people. See NOTES.md.
 */
export const CACHE_TTL_MS = 30_000;

export type Variables = Record<string, unknown>;

export type GraphQLResult<TData> = {
  data: TData | undefined;
  errors: string[];
};

type GraphQLErrorPayload = { message: string; path?: Array<string | number> };

/** Thrown for GraphQL-level errors when a caller opts in with `throwError`. */
export class GraphQLRequestError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join('; '));
    this.name = 'GraphQLRequestError';
    this.errors = errors;
  }
}

export function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError';
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Plain fetch. Resolves with data AND errors side by side; a partial response is
 * not a failure. Only transport problems (network, non-2xx, abort) reject.
 */
export async function request<TData>(
  query: string,
  variables: Variables = {},
  signal?: AbortSignal,
): Promise<GraphQLResult<TData>> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`);

  const body = (await res.json()) as { data?: TData | null; errors?: GraphQLErrorPayload[] };
  return {
    data: body.data ?? undefined,
    errors: (body.errors ?? []).map((e) => (e.path?.length ? `${e.path.join('.')}: ${e.message}` : e.message)),
  };
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

export type CacheEntry = {
  key: string;
  queryKey: string;
  query: string;
  variables: Variables;
  result?: GraphQLResult<unknown>;
  /** 0 = never fetched, or invalidated. */
  fetchedAt: number;
  inFlight?: Promise<GraphQLResult<unknown>>;
  controller?: AbortController;
  listeners: Set<() => void>;
};

const cache = new Map<string, CacheEntry>();

/** JSON.stringify with sorted keys, so { a, b } and { b, a } hash the same. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = obj[k];
        return acc;
      }, {});
  });
}

export function cacheKey(query: string, variables: Variables = {}): string {
  return `${query}::${stableStringify(variables)}`;
}

/** Default queryKey: the operation name, e.g. "ListDevices". */
export function operationName(query: string): string {
  return /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'anonymous';
}

export function peek(key: string): CacheEntry | undefined {
  return cache.get(key);
}

/** Fresh = has a clean result inside the TTL. Partial (data + errors) results are shown but never fresh. */
export function isFresh(entry: CacheEntry): boolean {
  return !!entry.result && entry.result.errors.length === 0 && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export function subscribe(key: string, listener: () => void): () => void {
  const entry = cache.get(key);
  if (!entry) return () => {};
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

function notify(entry: CacheEntry) {
  entry.listeners.forEach((listener) => listener());
}

function revalidate(entry: CacheEntry): Promise<GraphQLResult<unknown>> {
  const controller = new AbortController();
  const promise: Promise<GraphQLResult<unknown>> = request(entry.query, entry.variables, controller.signal)
    .then((result) => {
      // reset()/clearCache() may have detached this request; if so it must not write.
      if (entry.inFlight === promise && cache.get(entry.key) === entry) {
        entry.result = result;
        entry.fetchedAt = Date.now();
        notify(entry);
      }
      return result;
    })
    .finally(() => {
      if (entry.inFlight === promise) {
        entry.inFlight = undefined;
        entry.controller = undefined;
      }
    });

  entry.inFlight = promise;
  entry.controller = controller;
  return promise;
}

/**
 * Read-through fetch. Identical query + variables share one in-flight request
 * (two components mounting in the same tick = one network call).
 */
export function fetchQuery<TData>(
  query: string,
  variables: Variables,
  options: { queryKey?: string; force?: boolean } = {},
): Promise<GraphQLResult<TData>> {
  const key = cacheKey(query, variables);
  let entry = cache.get(key);
  if (!entry) {
    entry = {
      key,
      queryKey: options.queryKey ?? operationName(query),
      query,
      variables,
      fetchedAt: 0,
      listeners: new Set(),
    };
    cache.set(key, entry);
  }

  if (entry.inFlight) return entry.inFlight as Promise<GraphQLResult<TData>>;
  if (!options.force && isFresh(entry)) return Promise.resolve(entry.result as GraphQLResult<TData>);
  return revalidate(entry) as Promise<GraphQLResult<TData>>;
}

/**
 * Optimistic writes. Applies `patch` to every cached result `match` selects and
 * returns an undo. Undo only restores entries the server hasn't rewritten since,
 * so a rollback can never clobber fresher data with an old snapshot.
 */
export function patchQueries(
  match: (entry: CacheEntry) => boolean,
  patch: (data: unknown, entry: CacheEntry) => unknown,
): () => void {
  const undos: Array<() => void> = [];

  for (const entry of cache.values()) {
    const before = entry.result;
    if (before?.data === undefined || !match(entry)) continue;

    const nextData = patch(before.data, entry);
    if (nextData === before.data) continue;

    const after = { ...before, data: nextData };
    entry.result = after;
    notify(entry);

    undos.push(() => {
      if (entry.result !== after) return;
      entry.result = before;
      notify(entry);
    });
  }

  return () => undos.forEach((undo) => undo());
}

/**
 * Targeted invalidation. Matching entries become stale; the ones somebody is
 * currently rendering refetch now, the rest refetch on their next read.
 */
export function invalidateQueries(match: (entry: CacheEntry) => boolean): void {
  for (const entry of cache.values()) {
    if (!match(entry)) continue;
    entry.fetchedAt = 0;
    if (entry.listeners.size === 0) continue;

    const refresh = () => {
      revalidate(entry).catch(() => {
        // Background refresh: the entry keeps its last good result.
      });
    };
    // A request already in flight may predate the change, so refetch after it.
    if (entry.inFlight) entry.inFlight.then(refresh, refresh);
    else refresh();
  }
}

/** Abort in-flight requests for a queryKey. Cached results are left alone. */
export function cancelQueries(queryKey: string): void {
  for (const entry of cache.values()) {
    if (entry.queryKey !== queryKey || !entry.controller) continue;
    entry.controller.abort();
    entry.inFlight = undefined;
    entry.controller = undefined;
  }
}

/** Abort everything and drop every entry. Used on tenant switch and between tests. */
export function clearCache(): void {
  for (const entry of cache.values()) entry.controller?.abort();
  cache.clear();
}
