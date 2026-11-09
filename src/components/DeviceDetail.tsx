import { useTenantQuery } from '../data/tenant';
import { useAssignAction } from '../data/useAssignAction';
import {
  DEVICE_DETAIL,
  LIST_AVAILABLE_ACTIONS,
  type Action,
  type DeviceDetailData,
  type DeviceDetailVars,
  type ListAvailableActionsData,
  type ListAvailableActionsVars,
} from '../data/operations';
import { DeviceHistory } from './DeviceHistory';
import { formatDate } from './DeviceList';

/** Rendered with key={deviceId}: a new selection is a new panel with fresh hooks. */
export function DeviceDetail({ deviceId }: { deviceId: string }) {
  const { data, loading, errors } = useTenantQuery<DeviceDetailData, DeviceDetailVars>(DEVICE_DETAIL, {
    variables: { deviceId },
    fetchFirst: true,
  });
  const detail = data?.deviceDetail;
  const { assign, loading: assigning, error: assignError } = useAssignAction();

  return (
    <section className="panel" aria-labelledby="detail-heading">
      <h2 id="detail-heading">Device {detail?.serialNumber ?? ''}</h2>

      {!detail && loading && <p>Loading device…</p>}

      {!detail && !loading && errors.length > 0 && (
        <div role="alert" className="error">
          Couldn't load this device: {errors.join('; ')}
        </div>
      )}

      {detail && (
        <>
          {/* Partial success: show everything that resolved, and say exactly what didn't. */}
          {errors.length > 0 && (
            <div role="status" className="warning">
              Some details couldn't be loaded:
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <dl className="fields">
            <dt>Model</dt>
            <dd>
              {detail.deviceBrandName} {detail.deviceModelMarketingName}
            </dd>
            <dt>IMEIs</dt>
            <dd>
              {detail.IMEIs?.map((i) => (
                <div key={i.imei}>
                  {i.imei} {i.isPrimary ? '(primary)' : ''}
                </div>
              ))}
            </dd>
            <dt>IMSI</dt>
            <dd>{detail.imsi ?? <Unavailable />}</dd>
            <dt>State</dt>
            <dd>
              <span className="badge">{detail.state?.name ?? '—'}</span>
              {assigning && <span className="status"> saving…</span>}
            </dd>
            <dt>Policy</dt>
            <dd>
              {detail.policy ? (
                <>
                  <span className="swatch" style={{ background: detail.policy.color ?? undefined }} />
                  {detail.policy.name}
                </>
              ) : (
                <Unavailable />
              )}
            </dd>
            <dt>Locale</dt>
            <dd>{detail.locale ?? '—'}</dd>
            <dt>{detail.lastCheckin?.label ?? 'Last check-in'}</dt>
            <dd>{formatDate(detail.lastCheckin?.date)}</dd>
            <dt>First enrolled</dt>
            <dd>{formatDate(detail.firstEnrollAt)}</dd>
          </dl>

          {detail.state && (
            <DeviceActions
              stateId={detail.state.id}
              busy={assigning}
              onAction={(action) => void assign(detail.id, action)}
            />
          )}

          {assignError && (
            <div role="alert" className="error">
              Action failed and was undone: {assignError}
            </div>
          )}
        </>
      )}

      {/* Independent of the detail query: its failure must not blank the panel above. */}
      <DeviceHistory deviceId={deviceId} />
    </section>
  );
}

function Unavailable() {
  return <em className="muted">Unavailable</em>;
}

type ActionsProps = {
  stateId: number;
  busy: boolean;
  onAction: (action: Action) => void;
};

/** Buttons come from listAvailableActions for the current state; no action IDs are hardcoded. */
function DeviceActions({ stateId, busy, onAction }: ActionsProps) {
  const { data, loading, errors } = useTenantQuery<ListAvailableActionsData, ListAvailableActionsVars>(
    LIST_AVAILABLE_ACTIONS,
    { variables: { stateId: String(stateId) }, fetchFirst: true },
  );
  const actions = data?.listAvailableActions ?? [];

  if (errors.length > 0) {
    return <p className="error">Couldn't load actions: {errors.join('; ')}</p>;
  }
  if (!data && loading) return <p className="muted">Loading actions…</p>;

  return (
    <div className="actions">
      {actions.map((action) => (
        // Also disabled while reloading: these buttons were computed for the previous state.
        <button key={action.id} type="button" disabled={busy || loading} onClick={() => onAction(action)}>
          {action.actionName}
        </button>
      ))}
    </div>
  );
}
