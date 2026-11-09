# NOTES

```bash
npm install      # msw's postinstall writes public/mockServiceWorker.js (workerDirectory is set in package.json)
npm run dev
npm test
```

The data layer is in `src/data/`. `client.ts` is the transport and cache, `useQuery.ts` / `useMutation.ts` implement the contract, `tenant.tsx` has the context and the tenant wrappers, and `useAssignAction.ts` does the optimistic lock. I didn't touch the mock handlers.

## Race condition

Every `useQuery` instance numbers its requests. When a response comes back, the hook only writes state if that response's number is still the latest. A slow, older search that resolves late gets dropped in the hook, so components never have to deal with it. The late response still goes into its *own* cache entry (keyed by its variables). That's harmless, and it makes going back to that search instant.

I don't abort superseded searches. In-flight requests are shared between hooks (dedupe), so aborting "my" old request could kill a request another component is waiting on. Aborts are used for `reset()` and tenant switches instead. Selecting device A and then B quickly is covered too: the detail panel is keyed by `deviceId`, so A's hooks unmount and their late responses fail the same guard.

The test (`src/data/useQuery.test.ts`) holds two requests open, releases the newer one first, then the older one, and asserts the newer data stays.

## Tenant scoping

`tenantId` lives in `TenantContext`. `useTenantQuery` / `useTenantMutation` read it and spread it **last** into the variables, so a call site can't pass or override it. If the provider is missing, the hook throws instead of sending a request without a tenant.

I rejected reading it from module scope or `sessionStorage`. React would render with one value while `fetch` sent another, nothing would re-render on a change, and tests would share global state.

**Is the cache key enough? No, it's only lucky.** Including `tenantId` in the key stops beta from *reading* alpha's entries, but after a switch these would still be around:
- alpha's entries, sitting in memory,
- alpha's in-flight requests, which would still resolve,
- every hook's "previous data while loading". This is the real leak: the list would show alpha's rows under beta's name until beta's response arrived.

So on switch:
1. `clearCache()` runs **in the event handler, before React renders**. It aborts every in-flight request and drops every entry.
2. The provider renders its children under `key={tenantId}`. Every hook and all local UI state (search, page, selection) remounts empty.

The headless check I ran watched the DOM through the switch and never saw an alpha row. The cost is that switching back refetches. Tenant switching is rare, and in production it means a different token anyway.

## Cache TTL: 30 seconds

Long enough that paging back and forth, or reopening a device, comes from the cache. Short enough that a state change made by *another* operator (or a device checking in) doesn't stay on screen for long in a tool where people act on what they see. Our own mutations invalidate explicitly, so the TTL only bounds staleness from other people. Partial responses (data + errors) are shown but never count as fresh, so the next read retries them.

## Optimistic update: list row + detail

Hooks don't keep their own copy of `data`. Each hook stores the cache key of the response it's showing, reads the data through the module-level cache, and subscribes to that entry. The lock flow calls `patchQueries()`, which rewrites every cached entry that contains the device: every list page or filter containing it, plus its detail. It returns an undo function. Both views re-render from the same patch.

- **Failure:** the undo restores the snapshots, but only for entries the server hasn't rewritten in the meantime, so a rollback can't overwrite newer data. The error is shown in the panel.
- **Success:** the row keeps the optimistic state, and only `DeviceDetail` + `ListDeviceHistory` for that `deviceId` are invalidated (new policy, new history entry). The device list is **not** refetched.
- While the mutation is in flight the detail shows "saving…", so the optimistic state isn't presented as confirmed. `assignAction` returns a nullable Boolean, so anything but `true` is treated as a failure.

Rejected:
- **An override layer** (`Map<deviceId, pendingState>` merged at render). Every consumer has to remember to apply it, and cleaning it up is a lifecycle problem of its own.
- **Lifting state to a common ancestor.** It couples list and detail, and it breaks as soon as a third view shows the same device.

The cost of my choice: `data` is now a view onto shared, mutable cache state rather than something the hook owns. I think that's the right trade, and it's also what makes invalidation work.

## Invalidation by key

Each cache entry keeps `queryKey` (which defaults to the operation name) and its `variables` as fields next to the string key. "Which entries hold `dev-0042`?" becomes a predicate:
`queryKey === 'DeviceDetail' && variables.deviceId === 'dev-0042'`.
List rows are found by scanning `deviceList` for the id.

To invalidate **by entity**, I'd keep an index `entityId → Set<cacheKey>`, filled when results are written by walking them for `id` fields (ideally `__typename:id`). That's the first step toward normalisation, which I deliberately didn't build.

## Partial `data` + `errors`

`request()` resolves with both, and the hook stores both. `errors.length > 0` never implies `data` is missing. For `SN-0000-POISON` the panel renders everything that resolved, shows null fields as **"Unavailable"** (not "—", which would read as "empty"), and lists the field errors in a warning above. Actions stay available because `state` resolved. Blanking the panel would hide good data from an operator who may need it, for example to lock a device. Hard failures (no data) show an error state instead.

## Decisions worth flagging

- **Refetch keeps data.** Old rows stay (dimmed) with a loading indicator instead of flickering on every keystroke. This is only safe because of the tenant remount above.
- **One search box, two API filters.** The API ANDs `imei` and `serialNumber`, so I route the term by shape: all digits goes to `imei`, anything else to `serialNumber`.
- **Locking under a state filter.** If you lock a device while filtering by ACTIVE, the row stays visible showing LOCKED until the list revalidates. I prefer that to rows vanishing under the cursor.
- **Action buttons are disabled while actions reload**, because they were computed for the previous state.
- **The UI can't reach the rollback path.** `listAvailableActions` never offers Lock on a locked device, so the rollback only happens with a stale view (another operator got there first). I checked it by forcing `AssignAction` to fail.

## Left undone / next

- **A second test for the rollback.** Render the list hook, the detail hook and `useAssignAction` together and fail the mutation.
- **Ref-counted aborts.** `reset(key)` aborts a request that other hooks may be sharing. They see a silent abort (no error, no data). Ref-counting subscribers before aborting would fix it.
- **Surviving navigation.** A failed action's message is lost if the user has already moved to another device (the panel unmounts). It needs a notification area.
- **Filtered lists.** Mark lists with a `stateId` filter stale after a mutation, so their membership corrects on the next view.
- **Codegen for types** (they're hand-written now) and a `listStates` query instead of mirroring the enum.
- **Consciously skipped:** normalised storage, GC/eviction, subscriptions, refetch-on-focus, retry/backoff, Suspense.
