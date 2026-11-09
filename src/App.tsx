import { useState } from 'react';
import { TENANTS, TenantProvider, useTenant } from './data/tenant';
import { DeviceList } from './components/DeviceList';
import { DeviceDetail } from './components/DeviceDetail';

export default function App() {
  return (
    <TenantProvider>
      <Console />
    </TenantProvider>
  );
}

function Console() {
  // Lives under the tenant-keyed subtree, so a tenant switch clears the selection too.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <main>
      <header>
        <h1>ALPS Device Console</h1>
        <TenantSwitcher />
      </header>
      <div className="layout">
        <DeviceList selectedId={selectedId} onSelect={setSelectedId} />
        {selectedId ? (
          <DeviceDetail key={selectedId} deviceId={selectedId} />
        ) : (
          <section className="panel muted">Select a device to see its details.</section>
        )}
      </div>
    </main>
  );
}

function TenantSwitcher() {
  const { tenantId, setTenantId } = useTenant();
  return (
    <label>
      Tenant{' '}
      <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
        {TENANTS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
