import React, { useCallback, useEffect, useState } from 'react';
import { getPlatformAudit } from '../../api/client';
import { DataTable, Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/Button';

interface AuditRow {
  id: string;
  action: string;
  target_entity: string;
  target_id: string;
  actor_membership_id: string | null;
  actor_user_id: string | null;
  created_at: string;
}

export const AuditLogPage: React.FC = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getPlatformAudit({ limit: '50', offset: String(offset) });
    setLoading(false);
    if (!result.ok) { setError(result.message); return; }
    setRows((result.data as { auditLogs?: AuditRow[] }).auditLogs ?? []);
  }, [offset]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<AuditRow>[] = [
    { key: 'created_at', label: 'Time', width: 190, render: row => new Date(row.created_at).toLocaleString() },
    { key: 'action', label: 'Action', sortable: true, width: 220 },
    { key: 'target_entity', label: 'Entity', width: 150 },
    { key: 'target_id', label: 'Target', width: 240 },
    { key: 'actor_membership_id', label: 'Actor Membership', width: 240, render: row => row.actor_membership_id ?? row.actor_user_id ?? 'System' },
  ];

  return (
    <div className="page-body">
      <PageHeader title="Platform Audit Log" subtitle="Append-only events visible to this platform context" />
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        error={error ?? undefined}
        onRetry={load}
        searchKeys={['action', 'target_entity', 'target_id']}
        emptyTitle="No audit events"
        emptySubtitle="No events are available for this context."
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</Button>
        <Button variant="secondary" disabled={rows.length < 50 || loading} onClick={() => setOffset(value => value + 50)}>Next</Button>
      </div>
    </div>
  );
};