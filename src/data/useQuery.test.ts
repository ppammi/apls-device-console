import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { graphql, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { cacheKey, GRAPHQL_ENDPOINT, peek } from './client';
import { LIST_DEVICES, type ListDevicesData } from './operations';
import { useQuery } from './useQuery';

describe('useQuery', () => {
  it('ignores a stale response that resolves after a newer one', async () => {
    // Each request is held open until the test releases it, so the order is ours, not jitter's.
    const release = new Map<string, () => void>();
    server.use(
      graphql.link(GRAPHQL_ENDPOINT).query('ListDevices', async ({ variables }) => {
        const term = String(variables.serialNumber);
        await new Promise<void>((resolve) => release.set(term, resolve));
        return HttpResponse.json({
          data: {
            listDevices: {
              pageInfo: { total_count: 1 },
              deviceList: [{ id: term, serialNumber: term }],
            },
          },
        });
      }),
    );

    const varsFor = (term: string) => ({ tenantId: 'tenant-alpha', serialNumber: term, page: 1, pageSize: 10 });
    const { result, rerender } = renderHook(
      // A fresh variables object every render, like a real call site.
      ({ term }) => useQuery<ListDevicesData>(LIST_DEVICES, { variables: varsFor(term), fetchFirst: true }),
      { initialProps: { term: 'SN-OLD' } },
    );
    const serialShown = () => result.current.data?.listDevices?.deviceList?.[0]?.serialNumber;

    await waitFor(() => expect(release.has('SN-OLD')).toBe(true));
    rerender({ term: 'SN-NEW' });
    await waitFor(() => expect(release.has('SN-NEW')).toBe(true));

    // Newer request wins the race...
    release.get('SN-NEW')!();
    await waitFor(() => expect(serialShown()).toBe('SN-NEW'));

    // ...then the older one lands. Wait until the client has actually processed it
    // (it writes its own cache entry), then flush anything still queued.
    release.get('SN-OLD')!();
    await waitFor(() => expect(peek(cacheKey(LIST_DEVICES, varsFor('SN-OLD')))?.result).toBeDefined());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(serialShown()).toBe('SN-NEW');
    expect(result.current.loading).toBe(false);
    expect(result.current.errors).toEqual([]);
    expect(release.size).toBe(2); // value-compared variables: no extra requests, no loop
  });
});
