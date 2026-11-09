import { useCallback, useState } from 'react';
import { errorMessage, invalidateQueries, patchQueries } from './client';
import {
  ASSIGN_ACTION,
  DEVICE_STATES,
  type Action,
  type AssignActionData,
  type AssignActionVars,
  type DeviceDetailData,
  type DeviceState,
  type ListDevicesData,
} from './operations';
import { useTenantMutation } from './tenant';

/**
 * Optimistically move a device to the action's target state everywhere it is cached
 * (every list page/filter that contains it + its detail), then confirm or roll back.
 */
function patchDeviceState(deviceId: string, state: DeviceState) {
  return patchQueries(
    (entry) =>
      entry.queryKey === 'ListDevices' ||
      (entry.queryKey === 'DeviceDetail' && entry.variables.deviceId === deviceId),
    (data, entry) => {
      if (entry.queryKey === 'DeviceDetail') {
        const { deviceDetail } = data as DeviceDetailData;
        return deviceDetail ? { deviceDetail: { ...deviceDetail, state } } : data;
      }
      const { listDevices } = data as ListDevicesData;
      const rows = listDevices?.deviceList;
      if (!rows?.some((row) => row.id === deviceId)) return data; // untouched
      return {
        listDevices: { ...listDevices, deviceList: rows.map((row) => (row.id === deviceId ? { ...row, state } : row)) },
      };
    },
  );
}

export function useAssignAction() {
  const { mutateData, loading } = useTenantMutation<AssignActionData, AssignActionVars>(ASSIGN_ACTION, {
    throwError: true,
  });
  const [error, setError] = useState<string | null>(null);

  const assign = useCallback(
    async (deviceId: string, action: Action) => {
      setError(null);
      const target = DEVICE_STATES.find((s) => s.id === action.stateId) ?? { id: action.stateId ?? 0, name: null };
      const rollback = patchDeviceState(deviceId, target);

      try {
        const data = await mutateData({ deviceId, actionId: action.id });
        // assignAction is a nullable Boolean; anything but `true` is not a confirmation.
        if (data?.assignAction !== true) throw new Error('The server did not confirm the action.');
      } catch (err) {
        rollback();
        // TODO: if the user has already navigated to another device this message is lost
        // with the unmounted panel; a toast/notification area would be the real fix.
        setError(errorMessage(err));
        return;
      }

      // Success. The list row keeps the optimistic state (no list refetch); only this
      // device's detail and history are invalidated, so the panel picks up the new
      // policy and the history gains the new entry.
      invalidateQueries(
        (entry) =>
          (entry.queryKey === 'DeviceDetail' || entry.queryKey === 'ListDeviceHistory') &&
          entry.variables.deviceId === deviceId,
      );
    },
    [mutateData],
  );

  return { assign, loading, error };
}
