import React, { useCallback, useEffect, useState } from 'react';
import { getMyPermissions } from '../../api/client';
import { Badge } from '../../components/Badge';
import { DataTable, Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useSession } from '../../hooks/useSession';

interface PermissionRow { permission: string }

export const RolesPermissionsPage: React.FC = () => {
  const { context } = useSession();
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getMyPermissions();
    setLoading(false);
    if (!result.ok) { setError(result.message); return; }
    setPermissions((result.data.permissions ?? []).map(permission => ({ permission })));
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns: Column<PermissionRow>[] = [
    { key: 'permission', label: 'Permission', sortable: true, render: row => <Badge variant="info">{row.permission}</Badge> },
  ];

  return (
    <div className="page-body">
      <PageHeader
        title="Effective Permissions"
        subtitle={`${context?.roleKey ?? 'Current membership'} · ${context?.organisationName ?? 'Selected organisation'}`}
      />
      <DataTable
        columns={columns}
        data={permissions}
        loading={loading}
        error={error ?? undefined}
        onRetry={load}
        searchKeys={['permission']}
        emptyTitle="No granted permissions"
        emptySubtitle="This membership currently has no effective permissions."
      />
    </div>
  );
};
