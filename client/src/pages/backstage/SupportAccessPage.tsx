import React, { useCallback, useEffect, useState } from 'react';
import { createSupportGrant, getPlatformOrgs, getPlatformSupportGrants, revokeSupportGrant } from '../../api/client';
import { Badge, statusVariant } from '../../components/Badge';
import { Button } from '../../components/Button';
import { DataTable, Column } from '../../components/DataTable';
import { FormField, SelectInput, TextInput, TextareaInput } from '../../components/FormField';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../hooks/useToast';
import { ToastList } from '../../components/Toast';

interface Organisation { id: string; name: string; portal: string }
interface Grant { id: string; target_organisation_name: string; reason: string; grant_status: string; expires_at: string }

export const SupportAccessPage: React.FC = () => {
  const { toasts, addToast, removeToast } = useToast();
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [targetOrganisationId, setTargetOrganisationId] = useState('');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('4');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [orgResult, grantResult] = await Promise.all([getPlatformOrgs(), getPlatformSupportGrants()]);
    setLoading(false);
    if (!orgResult.ok) { setError(orgResult.message); return; }
    if (!grantResult.ok) { setError(grantResult.message); return; }
    setOrganisations((orgResult.data.organisations ?? []).filter((org: Organisation) => org.portal === 'subscriber'));
    setGrants(grantResult.data.grants ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!targetOrganisationId || !reason.trim()) return;
    setSaving(true);
    const result = await createSupportGrant({ targetOrganisationId, reason: reason.trim(), hours: Number(hours) });
    setSaving(false);
    if (!result.ok) { addToast('error', result.message); return; }
    addToast('success', 'Support grant created');
    setReason('');
    await load();
  };

  const handleRevoke = async (id: string) => {
    const result = await revokeSupportGrant(id);
    if (!result.ok) { addToast('error', result.message); return; }
    addToast('success', 'Support grant revoked');
    load();
  };

  const columns: Column<Grant>[] = [
    { key: 'target_organisation_name', label: 'Tenant', sortable: true, width: 200 },
    { key: 'reason', label: 'Reason', width: 300 },
    { key: 'grant_status', label: 'Status', width: 110, render: row => <Badge variant={statusVariant(row.grant_status)}>{row.grant_status}</Badge> },
    { key: 'expires_at', label: 'Expires', width: 190, render: row => new Date(row.expires_at).toLocaleString() },
  ];

  return (
    <div className="page-body">
      <ToastList toasts={toasts} onRemove={removeToast} />
      <PageHeader title="Support Access" subtitle="Issue and revoke time-limited, audited tenant support grants" />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) minmax(200px, 2fr) 120px auto', gap: 12, alignItems: 'end', marginBottom: 20 }}>
        <FormField label="Tenant" required>
          <SelectInput value={targetOrganisationId} onChange={event => setTargetOrganisationId(event.target.value)}>
            <option value="">Select tenant</option>
            {organisations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
          </SelectInput>
        </FormField>
        <FormField label="Reason" required>
          <TextareaInput value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe the support need" />
        </FormField>
        <FormField label="Hours" required>
          <TextInput type="number" min="1" max="24" value={hours} onChange={event => setHours(event.target.value)} />
        </FormField>
        <Button onClick={handleCreate} loading={saving} disabled={!targetOrganisationId || !reason.trim()}>Create grant</Button>
      </div>
      <DataTable
        columns={columns}
        data={grants}
        loading={loading}
        error={error ?? undefined}
        onRetry={load}
        searchKeys={['target_organisation_name', 'reason', 'grant_status']}
        emptyTitle="No support grants"
        emptySubtitle="Grants you issue will appear here."
        rowActions={row => row.grant_status === 'ACTIVE' ? <Button variant="danger" size="sm" onClick={() => handleRevoke(row.id)}>Revoke</Button> : undefined}
      />
    </div>
  );
};