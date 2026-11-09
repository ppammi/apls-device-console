import { useState } from 'react';
import { useTenantQuery } from '../data/tenant';
import { LIST_DEVICE_HISTORY, type ListDeviceHistoryData, type ListDeviceHistoryVars } from '../data/operations';
import { formatDate } from './DeviceList';
import { Pager } from './Pager';

const PAGE_SIZE = 5;

export function DeviceHistory({ deviceId }: { deviceId: string }) {
  const [page, setPage] = useState(1);
  const { data, loading, errors } = useTenantQuery<ListDeviceHistoryData, ListDeviceHistoryVars>(LIST_DEVICE_HISTORY, {
    variables: { deviceId, page, pageSize: PAGE_SIZE },
    fetchFirst: true,
  });

  const histories = data?.listDeviceHistory?.histories ?? [];
  const total = data?.listDeviceHistory?.pageInfo?.total_count ?? undefined;

  return (
    <div className="history">
      <h3>History {loading && data && <span className="status">updating…</span>}</h3>

      {errors.length > 0 && (
        <div role="alert" className="error">
          Couldn't load history: {errors.join('; ')}
        </div>
      )}

      {!data && loading ? (
        <p>Loading history…</p>
      ) : data && histories.length === 0 ? (
        <p>No history for this device.</p>
      ) : (
        histories.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Policy</th>
                <th>When</th>
                <th>Operator</th>
              </tr>
            </thead>
            <tbody>
              {histories.map((h, i) => (
                // The API gives history rows no id; createdAt + index is unique within a page.
                <tr key={`${h.createdAt}-${i}`}>
                  <td>
                    {h.type}
                    <div className="muted">{h.actionName}</div>
                  </td>
                  <td>
                    {h.policyName} → {h.nextPolicyName}
                  </td>
                  <td>{formatDate(h.createdAt)}</td>
                  <td>{h.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      <Pager label="History pages" page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
    </div>
  );
}
