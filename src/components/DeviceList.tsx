import { useEffect, useState } from 'react';
import { useTenantQuery } from '../data/tenant';
import { DEVICE_STATES, LIST_DEVICES, type ListDevicesData, type ListDevicesVars } from '../data/operations';
import { Pager } from './Pager';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

type Filters = { search: string; stateId: number | undefined; page: number };

type Props = {
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
};

export function DeviceList({ selectedId, onSelect }: Props) {
  const [searchInput, setSearchInput] = useState('');
  // One state object so changing search/state and resetting the page happen in the same
  // render; otherwise we'd fire one request with the new search on the old page.
  const [filters, setFilters] = useState<Filters>({ search: '', stateId: undefined, page: 1 });

  useEffect(() => {
    const timer = setTimeout(() => {
      const search = searchInput.trim();
      setFilters((f) => (f.search === search ? f : { ...f, search, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // The API filters IMEI and serial separately (AND, not OR). IMEIs are all digits and
  // serials always contain letters ("SN-…"), so route the term by its shape.
  const isImei = /^\d+$/.test(filters.search);
  const { data, loading, errors } = useTenantQuery<ListDevicesData, ListDevicesVars>(LIST_DEVICES, {
    variables: {
      imei: isImei ? filters.search : undefined,
      serialNumber: filters.search && !isImei ? filters.search : undefined,
      stateId: filters.stateId,
      page: filters.page,
      pageSize: PAGE_SIZE,
    },
    fetchFirst: true,
  });

  const rows = data?.listDevices?.deviceList ?? [];
  const total = data?.listDevices?.pageInfo?.total_count ?? undefined;

  return (
    <section className="panel" aria-labelledby="devices-heading">
      <h2 id="devices-heading">Devices</h2>

      <div className="filters">
        <label>
          Search IMEI or serial
          <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <label>
          State
          <select
            value={filters.stateId ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, stateId: e.target.value ? Number(e.target.value) : undefined, page: 1 }))
            }
          >
            <option value="">All</option>
            {DEVICE_STATES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <span className="status" aria-live="polite">
          {loading ? 'Loading…' : ''}
        </span>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="error">
          Couldn't load devices: {errors.join('; ')}
        </div>
      )}

      {!data && loading ? (
        <p>Loading devices…</p>
      ) : data && rows.length === 0 ? (
        <p>No devices match these filters.</p>
      ) : (
        rows.length > 0 && (
          <table className={loading ? 'is-stale' : undefined}>
            <thead>
              <tr>
                <th>Serial number</th>
                <th>Primary IMEI</th>
                <th>Model</th>
                <th>State</th>
                <th>Last check-in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} aria-selected={row.id === selectedId}>
                  <td>
                    <button type="button" className="link" onClick={() => onSelect(row.id)}>
                      {row.serialNumber}
                    </button>
                  </td>
                  <td>{row.IMEIs?.find((i) => i.isPrimary)?.imei ?? '—'}</td>
                  <td>{row.modelMarketingName}</td>
                  <td>
                    <span className="badge">{row.state?.name ?? '—'}</span>
                  </td>
                  <td>{formatDate(row.lastCheckin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      <Pager
        label="Device list pages"
        page={filters.page}
        pageSize={PAGE_SIZE}
        total={total}
        onChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </section>
  );
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString('en-GB') : '—';
}
