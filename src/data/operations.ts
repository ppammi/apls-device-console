/* Operation names matter: the mock dispatches on them. */

export const LIST_DEVICES = /* GraphQL */ `
  query ListDevices($tenantId: String, $imei: String, $serialNumber: String, $stateId: Int, $page: Int, $pageSize: Int) {
    listDevices(tenantId: $tenantId, imei: $imei, serialNumber: $serialNumber, stateId: $stateId, page: $page, pageSize: $pageSize) {
      pageInfo { total_count }
      deviceList {
        id
        serialNumber
        modelMarketingName
        brandName
        IMEIs { imei isPrimary }
        state { id name }
        policy { id name color }
        lastCheckin
      }
    }
  }
`;

export const DEVICE_DETAIL = /* GraphQL */ `
  query DeviceDetail($tenantId: String!, $deviceId: String!) {
    deviceDetail(tenantId: $tenantId, deviceId: $deviceId) {
      id
      serialNumber
      deviceBrandName
      deviceModelMarketingName
      imsi
      locale
      firstEnrollAt
      IMEIs { imei isPrimary }
      state { id name }
      policy { id name color }
      lastCheckin { label date color }
    }
  }
`;

export const LIST_DEVICE_HISTORY = /* GraphQL */ `
  query ListDeviceHistory($tenantId: String!, $deviceId: String!, $page: Int, $pageSize: Int) {
    listDeviceHistory(tenantId: $tenantId, deviceId: $deviceId, page: $page, pageSize: $pageSize) {
      pageInfo { total_count }
      histories { type createdAt email policyName nextPolicyName actionName }
    }
  }
`;

export const LIST_AVAILABLE_ACTIONS = /* GraphQL */ `
  query ListAvailableActions($tenantId: String, $stateId: String) {
    listAvailableActions(tenantId: $tenantId, stateId: $stateId) {
      id
      actionName
      policyName
      stateId
    }
  }
`;

export const ASSIGN_ACTION = /* GraphQL */ `
  mutation AssignAction($tenantId: String!, $deviceId: String!, $actionId: String!) {
    assignAction(tenantId: $tenantId, deviceId: $deviceId, actionId: $actionId)
  }
`;

/* -------------------------------------------------------------------------- */
/* Types (hand-written; codegen would replace these in a real project)        */
/* -------------------------------------------------------------------------- */

export type DeviceState = { id: number; name: string | null };
export type Policy = { id: string; name: string | null; color: string | null };
export type Imei = { imei: string | null; isPrimary: boolean | null };
export type PageInfo = { total_count: number | null };

export type DeviceRow = {
  id: string;
  serialNumber: string | null;
  modelMarketingName: string | null;
  brandName: string | null;
  IMEIs: Imei[] | null;
  state: DeviceState | null;
  policy: Policy | null;
  lastCheckin: string | null;
};

export type ListDevicesData = {
  listDevices: { pageInfo: PageInfo | null; deviceList: DeviceRow[] | null } | null;
};
export type ListDevicesVars = {
  imei?: string;
  serialNumber?: string;
  stateId?: number;
  page: number;
  pageSize: number;
};

export type DeviceDetail = {
  id: string;
  serialNumber: string | null;
  deviceBrandName: string | null;
  deviceModelMarketingName: string | null;
  imsi: string | null;
  locale: string | null;
  firstEnrollAt: string | null;
  IMEIs: Imei[] | null;
  state: DeviceState | null;
  policy: Policy | null;
  lastCheckin: { label: string | null; date: string | null; color: string | null } | null;
};
export type DeviceDetailData = { deviceDetail: DeviceDetail | null };
export type DeviceDetailVars = { deviceId: string };

export type HistoryEntry = {
  type: string | null;
  createdAt: string | null;
  email: string | null;
  policyName: string | null;
  nextPolicyName: string | null;
  actionName: string | null;
};
export type ListDeviceHistoryData = {
  listDeviceHistory: { pageInfo: PageInfo | null; histories: HistoryEntry[] | null } | null;
};
export type ListDeviceHistoryVars = { deviceId: string; page: number; pageSize: number };

export type Action = { id: string; actionName: string | null; policyName: string | null; stateId: number | null };
export type ListAvailableActionsData = { listAvailableActions: Action[] | null };
export type ListAvailableActionsVars = { stateId: string };

export type AssignActionData = { assignAction: boolean | null };
export type AssignActionVars = { deviceId: string; actionId: string };

/**
 * There's no "list states" query, so the filter options (and the name we show for an
 * optimistic state) mirror the server's enum. TODO: fetch these if the API grows one.
 */
export const DEVICE_STATES: DeviceState[] = [
  { id: 1, name: 'ENROLLED' },
  { id: 2, name: 'ACTIVE' },
  { id: 3, name: 'LOCKED' },
  { id: 4, name: 'RELEASED' },
];
